// Smartsheet → carrier_jobs sync for Swift Transportation. Called by:
//   - scripts/sync-swift.ts (CLI; dry-run and --apply)
//   - src/app/api/cron/sync-swift/route.ts (daily Vercel cron)
//
// The actual sync logic, column mapping, geocoding, and upsert/archive
// behavior live here so the two callers stay in sync.

import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import type { db as defaultDb } from "@/db/client";
import { carrierJobs, carriers, zipCodes } from "@/db/schema";

type DbClient = typeof defaultDb;

const SMARTSHEET_BASE = "https://api.smartsheet.com/2.0";
const SWIFT_CARRIER_NAME = "Swift Transportation";
const SWIFT_INTELLIAPP_URL =
  "https://www.tenstreet.com/apps/swiftcompthird?source=cdla.jobs";

// --- Smartsheet types -----------------------------------------------------

interface SsColumn {
  id: number;
  title: string;
  type: string;
}
interface SsCell {
  columnId: number;
  value?: string | number | boolean | null;
  displayValue?: string;
}
interface SsRow {
  id: number;
  cells: SsCell[];
}
interface SsSheet {
  id: number;
  name: string;
  totalRowCount: number;
  columns: SsColumn[];
  rows: SsRow[];
}

// --- Public types ---------------------------------------------------------

export interface SwiftSyncOptions {
  apiKey: string;
  sheetIdOrToken: string;
  apply: boolean;
}

export interface MappedJob {
  externalSourceId: string;
  positionTitle: string;
  description: string;
  domicileCity: string;
  domicileState: string;
  domicileZip: string | null;
  domicileLat: string;
  domicileLng: string;
  hiringRadiusMiles: number | null;
  equipment: string;
  minExperienceMonths: number;
  acceptedHomeTimeTypes: string[];
  requiredEndorsements: string[];
  payRangeMaxWeeklyUsd: number | null;
  displayPayRangeMaxWeeklyUsd: number | null;
  // Surfaced on the match card's expanded view:
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
  displaySigningBonusUsd: number | null;
}

export interface SwiftSyncResult {
  sheetName: string;
  totalRows: number;
  mapped: number;
  skipped: Record<string, number>;
  sampleJobs: MappedJob[];
  applied: boolean;
  carrierId?: string;
  inserted: number;
  updated: number;
  archived: number;
}

// --- Smartsheet API -------------------------------------------------------

async function ssFetch<T>(apiKey: string, path: string): Promise<T> {
  const res = await fetch(`${SMARTSHEET_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = body as { message?: string; errorCode?: number } | null;
    throw new Error(
      `Smartsheet ${path} → ${err?.errorCode ?? res.status}: ${err?.message ?? text}`,
    );
  }
  return body as T;
}

class ColumnMap {
  private byTitle = new Map<string, number>();
  constructor(columns: SsColumn[]) {
    for (const c of columns) this.byTitle.set(c.title.trim(), c.id);
  }
  cellValue(row: SsRow, title: string): string | null {
    const colId = this.byTitle.get(title);
    if (colId == null) return null;
    const cell = row.cells.find((c) => c.columnId === colId);
    if (!cell) return null;
    const v = cell.displayValue ?? cell.value;
    if (v == null) return null;
    const s = String(v).trim();
    return s.length === 0 ? null : s;
  }
  cellInt(row: SsRow, title: string): number | null {
    const s = this.cellValue(row, title);
    if (s == null) return null;
    const cleaned = s.replace(/[^0-9.-]/g, "");
    if (cleaned.length === 0) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
}

// --- Pure mapping helpers -------------------------------------------------

function mapEquipment(lob: string | null): string | null {
  if (!lob) return null;
  const u = lob.toUpperCase().trim();
  if (u.includes("DRY") || u.includes("WAL GRO")) return "dry-van";
  if (u.includes("REF")) return "reefer";
  if (u.includes("FLATBED")) return "flatbed";
  if (u.includes("INT")) return "intermodal";
  return null;
}

// Human-readable LOB. Smartsheet uses codes like DED-DRY or OTR-REF.
// Drivers reading the matches list want lane type + equipment in plain
// English ("Dedicated Dry Van", "OTR Reefer"), not the carrier-internal code.
function readableLob(lob: string | null): string {
  if (!lob) return "";
  const u = lob.toUpperCase().trim();
  const laneType = u.startsWith("OTR") ? "OTR" : "Dedicated";
  let equip = "";
  if (u.includes("WAL GRO")) equip = "Walmart Grocery";
  else if (u.includes("DRY")) equip = "Dry Van";
  else if (u.includes("REF")) equip = "Reefer";
  else if (u.includes("FLATBED")) equip = "Flatbed";
  else if (u.includes("INT")) equip = "Intermodal";
  return equip ? `${laneType} ${equip}` : laneType;
}

// "Load - Unload" → driver-readable touch-freight summary. Examples from
// the Smartsheet picklist: No, Live Load, Live Unload, Preload, Drop and
// Hook, Full Hand Unload, Load Assist, Unload Assist.
function touchFreightSummary(s: string | null): string | null {
  if (!s) return null;
  const u = s.toUpperCase();
  if (u === "NO" || u.includes("DROP AND HOOK") || u.includes("PRELOAD")) {
    return "No-touch freight";
  }
  if (u.includes("FULL HAND")) return "Full hand unload";
  if (u.includes("LIVE LOAD") && u.includes("LIVE UNLOAD")) {
    return "Live load and live unload";
  }
  if (u.includes("LIVE LOAD")) return "Live load";
  if (u.includes("LIVE UNLOAD")) return "Live unload";
  if (u.includes("ASSIST")) return "Some load/unload assistance";
  // Fallback: surface the source value so drivers see something accurate.
  return s;
}

function mapMinExperienceMonths(
  expReq: string | null,
  traineesOk: string | null,
): number {
  if (traineesOk && traineesOk.toUpperCase().includes("YES")) return 0;
  if (!expReq) return 0;
  const l = expReq.toLowerCase();
  if (l.includes("trainee")) return 0;
  if (l.includes("first seat")) return 6;
  if (l.includes("1 yr") || l.includes("1 year")) return 12;
  return 0;
}

function mapHomeTime(s: string | null): string[] {
  if (!s) return ["weekly"];
  const l = s.toLowerCase();
  if (
    l.includes("once a week") ||
    l.includes("every four") ||
    l.includes("every five")
  ) {
    return ["weekly"];
  }
  if (l.includes("twice a week")) return ["weekly", "daily"];
  if (
    l.includes("every other day") ||
    l.includes("every two days") ||
    l.includes("every three days")
  ) {
    return ["daily"];
  }
  if (l.includes("two weeks") || l.includes("biweekly")) return ["biweekly"];
  if (l.includes("three weeks") || l.includes("month")) return ["otr"];
  return ["weekly"];
}

function mapEndorsements(s: string | null): string[] {
  if (!s) return [];
  const u = s.toUpperCase();
  const out: string[] = [];
  if (u.includes("HAZMAT")) out.push("hazmat");
  if (u.includes("TANKER")) out.push("tanker");
  if (u.includes("TWIC")) out.push("twic");
  if (u.includes("DOUBLES")) out.push("doubles-triples");
  return out;
}

function parseMoney(s: string | null): number | null {
  if (!s) return null;
  const matches = s.match(/\$?\s*(\d{1,3}(?:,\d{3})*|\d{3,5})(?:\.\d+)?/g);
  if (!matches) return null;
  const numbers = matches
    .map((m) => Number(m.replace(/[^0-9.]/g, "")))
    .filter((n) => Number.isFinite(n) && n >= 300 && n <= 5000);
  if (numbers.length === 0) return null;
  return Math.max(...numbers);
}

function parseZip(s: string | null): string | null {
  if (!s) return null;
  const match = s.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

function firstCityState(
  city: string | null,
  state: string | null,
): { city: string | null; state: string | null } {
  if (!city || !state) return { city, state };
  const firstCity = city.split(/[,;\n/|]/)[0]?.trim() ?? city.trim();
  const firstState =
    state.split(/[,;\n/|]/)[0]?.trim().toUpperCase().slice(0, 2) ?? state;
  return {
    city: firstCity.length > 0 ? firstCity : null,
    state: firstState.length === 2 ? firstState : null,
  };
}

// --- Geocoding ------------------------------------------------------------

async function resolveLatLng(
  db: DbClient,
  zip: string | null,
  city: string | null,
  state: string | null,
): Promise<
  | {
      lat: string;
      lng: string;
      zip: string;
      city: string;
      state: string;
    }
  | null
> {
  if (zip) {
    const z5 = zip.match(/\d{5}/);
    if (z5) {
      const row = await db.query.zipCodes.findFirst({
        where: eq(zipCodes.zip, z5[0]),
      });
      if (row) {
        return {
          lat: String(row.lat),
          lng: String(row.lng),
          zip: row.zip,
          city: row.city,
          state: row.state,
        };
      }
    }
  }
  if (city && state) {
    const stateUpper = state.trim().toUpperCase().slice(0, 2);
    const rows = await db
      .select()
      .from(zipCodes)
      .where(
        and(
          eq(zipCodes.state, stateUpper),
          sql`lower(${zipCodes.city}) = lower(${city.trim()})`,
        ),
      )
      .limit(1);
    if (rows.length > 0) {
      const r = rows[0];
      return {
        lat: String(r.lat),
        lng: String(r.lng),
        zip: r.zip,
        city: r.city,
        state: r.state,
      };
    }
  }
  return null;
}

// --- Row → MappedJob ------------------------------------------------------

async function mapRow(
  db: DbClient,
  row: SsRow,
  cm: ColumnMap,
  sheetId: number,
): Promise<{ ok: true; job: MappedJob } | { ok: false; skip: string }> {
  const openClosed = cm.cellValue(row, "Open or Closed");
  if (openClosed && openClosed.toUpperCase() !== "OPEN") {
    return { ok: false, skip: `not open (status: ${openClosed})` };
  }
  const solo = cm.cellInt(row, "# of Drivers Needed (Solo)");
  const team = cm.cellInt(row, "# of Drivers Needed (Team)");
  if ((solo ?? 0) === 0 && (team ?? 0) === 0) {
    return { ok: false, skip: "no drivers needed" };
  }
  const lob = cm.cellValue(row, "LOB (Line of Business)");
  const equipment = mapEquipment(lob);
  if (!equipment) {
    return { ok: false, skip: `unmapped LOB: ${lob ?? "(none)"}` };
  }
  const rawCity = cm.cellValue(row, "Hiring City(s)");
  const rawState = cm.cellValue(row, "Hiring State");
  const rawZip = cm.cellValue(row, "Hiring City Zip Code(s) (Dedicated Only)");
  if (!rawCity && !rawZip) {
    return { ok: false, skip: "no city or zip" };
  }
  const { city, state } = firstCityState(rawCity, rawState);
  const zip = parseZip(rawZip);
  const geo = await resolveLatLng(db, zip, city, state);
  if (!geo) {
    return {
      ok: false,
      skip: `could not geocode (zip=${zip ?? "none"}, city=${city ?? "none"}, state=${state ?? "none"})`,
    };
  }
  void rawState;

  const minExp = mapMinExperienceMonths(
    cm.cellValue(row, "Experience Requirements"),
    cm.cellValue(row, "Trainees OK?"),
  );
  const homeTime = mapHomeTime(cm.cellValue(row, "Home Time"));
  const endorsements = mapEndorsements(
    cm.cellValue(row, "Required Endorsements/Certificates"),
  );
  const radius = cm.cellInt(row, 'Live within "X miles" of Zip Code(s)');
  const earnings = parseMoney(cm.cellValue(row, "Average Earnings per Week"));

  const account = cm.cellValue(row, "Account") ?? "";
  const lane = cm.cellValue(row, "Lane Information") ?? "";
  const favorable = cm.cellValue(row, "Favorable Info on Lane") ?? "";
  const unfavorable = cm.cellValue(row, "Unfavorable Info on Lane") ?? "";
  const bonus = cm.cellValue(row, "BONUS OFFER") ?? "";
  const bonusDetails = cm.cellValue(row, "Bonus Details") ?? "";
  const transitionBonus = cm.cellValue(row, "Transition Bonus") ?? "";
  const loadUnload = cm.cellValue(row, "Load - Unload");
  const weekendWork = cm.cellValue(row, "Weekend Work");
  const holidayWork = cm.cellValue(row, "Holiday Work");
  const homeTimeRaw = cm.cellValue(row, "Home Time");
  const weeklyMileage = cm.cellValue(row, "Weekly Mileage");

  // Description: lane prose first, then favorable/unfavorable so drivers
  // get an honest read on the route before deciding to apply.
  const descParts = [
    lane,
    favorable ? `What's good about this lane: ${favorable}` : "",
    unfavorable ? `What to know: ${unfavorable}` : "",
  ].filter((s) => s.length > 0);

  // displayLaneDescription: short, scannable lane summary that lands above
  // the description in the match card detail view. Account name first
  // because it's often the carrier-customer name (e.g., "Walmart Grocery")
  // — the thing a driver recognizes before anything else.
  const lobReadable = readableLob(lob);
  const laneDescParts = [
    account,
    lobReadable,
    weeklyMileage ? `~${weeklyMileage} mi/wk` : "",
  ].filter((s) => s.length > 0);
  const displayLaneDescription =
    laneDescParts.length > 0 ? laneDescParts.join(" · ") : null;

  // displayBenefitsSummary: the at-a-glance bullets drivers ask about
  // before they click into the apply flow.
  const touch = touchFreightSummary(loadUnload);
  const benefitsParts: string[] = [];
  if (touch) benefitsParts.push(touch);
  if (weekendWork && weekendWork.toUpperCase() !== "NO") {
    benefitsParts.push(
      weekendWork.toUpperCase() === "VOLUNTARY"
        ? "Weekend work voluntary"
        : `Weekend work: ${weekendWork.toLowerCase()}`,
    );
  } else if (weekendWork && weekendWork.toUpperCase() === "NO") {
    benefitsParts.push("No weekend work");
  }
  if (holidayWork && holidayWork.toLowerCase() !== "no") {
    benefitsParts.push(`Holiday work: ${holidayWork}`);
  }
  if (bonus && bonus !== "NO BONUS OFFER") {
    benefitsParts.push(`Bonus: ${bonus}`);
  }
  if (
    bonusDetails &&
    bonusDetails.toLowerCase() !== "no" &&
    !benefitsParts.some((b) => b.includes(bonusDetails))
  ) {
    benefitsParts.push(bonusDetails);
  }
  const displayBenefitsSummary =
    benefitsParts.length > 0 ? benefitsParts.join(" · ") : null;

  // displaySigningBonusUsd: parse a dollar amount from the bonus columns
  // if present. Used by the match card to render "$X,XXX sign-on bonus."
  const displaySigningBonusUsd =
    parseMoney(transitionBonus) ?? parseMoney(bonus);

  // Job-board-style title: "Account — Dedicated Reefer Driver — Atlanta, GA".
  // Account (the Smartsheet primary column) usually identifies the
  // customer/lane (e.g., "Walmart Grocery"), which is what a driver
  // recognizes first. Skip the prefix when Account is blank or duplicates
  // the LOB code so we don't ship awkward titles like "OTR-DRY — OTR Dry
  // Van Driver — Phoenix, AZ".
  const accountPrefix =
    account &&
    account.toUpperCase().trim() !== (lob ?? "").toUpperCase().trim()
      ? `${account} — `
      : "";
  const positionTitle = lobReadable
    ? `${accountPrefix}${lobReadable} Driver — ${geo.city}, ${geo.state}`
    : `${accountPrefix}CDL-A Driver — ${geo.city}, ${geo.state}`;

  return {
    ok: true,
    job: {
      externalSourceId: `smartsheet:${sheetId}:${row.id}`,
      positionTitle,
      description: descParts.join("\n\n"),
      domicileCity: geo.city,
      domicileState: geo.state,
      domicileZip: geo.zip,
      domicileLat: geo.lat,
      domicileLng: geo.lng,
      hiringRadiusMiles: lob?.startsWith("OTR") ? null : (radius ?? 50),
      equipment,
      minExperienceMonths: minExp,
      acceptedHomeTimeTypes: homeTime,
      requiredEndorsements: endorsements,
      payRangeMaxWeeklyUsd: earnings,
      displayPayRangeMaxWeeklyUsd: earnings,
      displayHomeTimeDescription: homeTimeRaw,
      displayLaneDescription,
      displayBenefitsSummary,
      displaySigningBonusUsd,
    },
  };
}

// --- Carrier + job upserts ------------------------------------------------

async function upsertSwiftCarrier(db: DbClient): Promise<string> {
  const existing = await db.query.carriers.findFirst({
    where: eq(carriers.name, SWIFT_CARRIER_NAME),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(carriers)
    .values({
      name: SWIFT_CARRIER_NAME,
      legalName: "Swift Transportation Co. of Arizona, LLC",
      kind: "partner",
      tier: "tier_2",
      status: "active",
      primaryContactEmail: "recruiters@swifttrans.com",
      publicCareersUrl: "https://www.swifttrans.com/careers",
      phtpReferralAgreementActive: true,
    })
    .returning({ id: carriers.id });
  if (!row) throw new Error("failed to insert Swift carrier row");
  return row.id;
}

async function upsertJob(
  db: DbClient,
  carrierId: string,
  job: MappedJob,
  sourceSheetUrl: string,
): Promise<"inserted" | "updated"> {
  const existing = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.externalSourceId, job.externalSourceId),
  });
  const common = {
    status: "active" as const,
    positionTitle: job.positionTitle,
    description: job.description,
    domicileCity: job.domicileCity,
    domicileState: job.domicileState,
    domicileZip: job.domicileZip ?? undefined,
    domicileLat: job.domicileLat,
    domicileLng: job.domicileLng,
    hiringRadiusMiles: job.hiringRadiusMiles ?? undefined,
    equipment: job.equipment,
    minExperienceMonths: job.minExperienceMonths,
    acceptedHomeTimeTypes: job.acceptedHomeTimeTypes as (
      | "daily"
      | "weekly"
      | "biweekly"
      | "otr"
    )[],
    requiredEndorsements: job.requiredEndorsements,
    payRangeMaxWeeklyUsd: job.payRangeMaxWeeklyUsd ?? undefined,
    displayPayRangeMaxWeeklyUsd: job.displayPayRangeMaxWeeklyUsd ?? undefined,
    displayHomeTimeDescription: job.displayHomeTimeDescription ?? undefined,
    displayLaneDescription: job.displayLaneDescription ?? undefined,
    displayBenefitsSummary: job.displayBenefitsSummary ?? undefined,
    displaySigningBonusUsd: job.displaySigningBonusUsd ?? undefined,
    applicationSurface: "tenstreet_intelliapp" as const,
    applicationUrl: SWIFT_INTELLIAPP_URL,
    dataSource: "tenstreet_feed" as const,
    sourceUrl: sourceSheetUrl,
    verificationStatus: "verified" as const,
    dataQuality: "partial" as const,
    lastVerifiedAt: new Date(),
  };
  if (existing) {
    await db
      .update(carrierJobs)
      .set({ ...common, updatedAt: new Date() })
      .where(eq(carrierJobs.id, existing.id));
    return "updated";
  }
  await db.insert(carrierJobs).values({
    carrierId,
    externalSourceId: job.externalSourceId,
    ...common,
  });
  return "inserted";
}

async function archiveStaleSwiftJobs(
  db: DbClient,
  carrierId: string,
  keepIds: string[],
): Promise<number> {
  if (keepIds.length === 0) return 0;
  const result = await db
    .update(carrierJobs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(carrierJobs.carrierId, carrierId),
        isNotNull(carrierJobs.externalSourceId),
        notInArray(carrierJobs.externalSourceId, keepIds),
      ),
    )
    .returning({ id: carrierJobs.id });
  return result.length;
}

// --- Public entry point ---------------------------------------------------

export async function syncSwiftJobs(
  db: DbClient,
  opts: SwiftSyncOptions,
): Promise<SwiftSyncResult> {
  const sheet = await ssFetch<SsSheet>(
    opts.apiKey,
    `/sheets/${opts.sheetIdOrToken}`,
  );
  const cm = new ColumnMap(sheet.columns);

  const mapped: MappedJob[] = [];
  const skipped: Record<string, number> = {};
  for (const row of sheet.rows) {
    const r = await mapRow(db, row, cm, sheet.id);
    if (r.ok) mapped.push(r.job);
    else skipped[r.skip] = (skipped[r.skip] ?? 0) + 1;
  }

  const base: SwiftSyncResult = {
    sheetName: sheet.name,
    totalRows: sheet.totalRowCount,
    mapped: mapped.length,
    skipped,
    sampleJobs: mapped.slice(0, 5),
    applied: false,
    inserted: 0,
    updated: 0,
    archived: 0,
  };

  if (!opts.apply) return base;

  const carrierId = await upsertSwiftCarrier(db);
  let inserted = 0;
  let updated = 0;
  const sourceUrl = `https://app.smartsheet.com/sheets/${opts.sheetIdOrToken}`;
  for (const job of mapped) {
    const r = await upsertJob(db, carrierId, job, sourceUrl);
    if (r === "inserted") inserted += 1;
    else updated += 1;
  }
  const archived = await archiveStaleSwiftJobs(
    db,
    carrierId,
    mapped.map((j) => j.externalSourceId),
  );

  return {
    ...base,
    applied: true,
    carrierId,
    inserted,
    updated,
    archived,
  };
}
