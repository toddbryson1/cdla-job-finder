import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { and, eq, isNotNull, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/db/schema";

// Smartsheet → carrier_jobs sync for Swift Transportation.
//
// Usage:
//   npx tsx scripts/sync-swift.ts                  # dry-run (no DB writes)
//   npx tsx scripts/sync-swift.ts --apply          # writes to DB
//   DATABASE_URL=<neon-url> ... --apply            # against Neon
//
// What it does:
//   1. Pulls every row from the Smartsheet "Hiring Data Base" sheet.
//   2. Filters to OPEN rows with at least 1 solo or team driver needed.
//   3. Maps each row into a carrier_jobs payload (best-effort — many
//      Smartsheet concepts don't map cleanly; we map what fits).
//   4. Upserts a "Swift Transportation" carrier (by name).
//   5. Upserts each job by external_source_id = `smartsheet:<sheetId>:<rowId>`.
//   6. Archives Swift jobs whose external_source_id is no longer in the
//      Smartsheet pull (status='archived'; rows preserved for FK history).
//
// Each row that maps successfully gets a carrier_jobs row. Skipped rows
// are logged with the reason (no zip+city, closed, no drivers needed, etc.)
// so we can iterate on mapping accuracy.

const SHEET_ID_OR_TOKEN =
  process.env.SMARTSHEET_SWIFT_SHEET_ID ??
  "8J4Q4hvjx97Wf28G74XcQJ5RjVfwQ5wXv7CxjFM1";
const SMARTSHEET_BASE = "https://api.smartsheet.com/2.0";
const APPLY = process.argv.includes("--apply");

const apiKey = process.env.SMARTSHEET_API_KEY;
const dbUrl = process.env.DATABASE_URL;
if (!apiKey) {
  console.error("SMARTSHEET_API_KEY is not set. Add it to .env.local.");
  process.exit(1);
}
if (!dbUrl) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pg = postgres(dbUrl, { prepare: false, max: 5 });
const db = drizzle(pg, { schema });

// --- Smartsheet API --------------------------------------------------------

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

async function ssFetch<T>(path: string): Promise<T> {
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

// --- Column lookup ---------------------------------------------------------

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

// --- Mapping helpers -------------------------------------------------------

// Smartsheet LOB → our equipment enum
function mapEquipment(lob: string | null): string | null {
  if (!lob) return null;
  const u = lob.toUpperCase().trim();
  if (u.includes("DRY") || u.includes("WAL GRO")) return "dry-van";
  if (u.includes("REF")) return "reefer";
  if (u.includes("FLATBED")) return "flatbed";
  if (u.includes("INT")) return "intermodal";
  return null;
}

function mapMinExperienceMonths(s: string | null): number {
  if (!s) return 0;
  const l = s.toLowerCase();
  if (l.includes("trainee")) return 0;
  if (l.includes("first seat")) return 6;
  if (l.includes("1 yr") || l.includes("1 year")) return 12;
  return 0;
}

// Smartsheet "Home Time" picklist → our home_time enum array.
// The picklist has many options; we map by keyword.
function mapHomeTime(s: string | null): string[] {
  if (!s) return ["weekly"];
  const l = s.toLowerCase();
  if (l.includes("once a week") || l.includes("every four") || l.includes("every five"))
    return ["weekly"];
  if (l.includes("twice a week")) return ["weekly", "daily"];
  if (l.includes("every other day") || l.includes("every two days") || l.includes("every three days"))
    return ["daily"];
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

// Smartsheet picklist values are sometimes concatenated when multiple
// options are selected ("$1,300$1,400$1,500"). Extract every 3-4 digit
// dollar value and return the max — that's the cell's upper-bound earnings.
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

// Smartsheet stores zips inconsistently — sometimes as text "30303",
// sometimes as numbers that get formatted "30,303.00", sometimes as
// lists "30303;30339;30144". Pull the first plausible 5-digit zip.
function parseZip(s: string | null): string | null {
  if (!s) return null;
  const match = s.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

// Multi-city rows like "Atlanta, GA; Greer, SC; Pooler, GA" — return the
// first city/state pair. Loses information but recovers a valid job that
// would otherwise skip entirely.
function firstCityState(
  city: string | null,
  state: string | null,
): { city: string | null; state: string | null } {
  if (!city || !state) return { city, state };
  // Split city by common separators
  const firstCity = city.split(/[,;\n/|]/)[0]?.trim() ?? city.trim();
  const firstState = state.split(/[,;\n/|]/)[0]?.trim().toUpperCase().slice(0, 2) ?? state;
  return {
    city: firstCity.length > 0 ? firstCity : null,
    state: firstState.length === 2 ? firstState : null,
  };
}

// --- Geocoding via zip_codes table ----------------------------------------

async function resolveLatLng(
  zip: string | null,
  city: string | null,
  state: string | null,
): Promise<{ lat: string; lng: string; zip: string; city: string; state: string } | null> {
  // Strategy: zip first (exact). Then city+state.
  if (zip) {
    const z5 = zip.match(/\d{5}/);
    if (z5) {
      const row = await db.query.zipCodes.findFirst({
        where: eq(schema.zipCodes.zip, z5[0]),
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
    // Pick the most populous-looking zip for the city (lowest zip number
    // is a rough proxy; refine later).
    const rows = await db
      .select()
      .from(schema.zipCodes)
      .where(
        and(
          eq(schema.zipCodes.state, stateUpper),
          sql`lower(${schema.zipCodes.city}) = lower(${city.trim()})`,
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

// --- Row → carrier_jobs payload --------------------------------------------

interface MappedJob {
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
}

async function mapRow(
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
  const geo = await resolveLatLng(zip, city, state);
  if (!geo) {
    return {
      ok: false,
      skip: `could not geocode (zip=${zip ?? "none"}, city=${city ?? "none"}, state=${state ?? "none"})`,
    };
  }
  // Suppress unused-var warning — rawState used inline above
  void rawState;

  const minExp = mapMinExperienceMonths(cm.cellValue(row, "Experience Requirements"));
  const homeTime = mapHomeTime(cm.cellValue(row, "Home Time"));
  const endorsements = mapEndorsements(cm.cellValue(row, "Required Endorsements/Certificates"));
  const radius = cm.cellInt(row, 'Live within "X miles" of Zip Code(s)');
  const earnings = parseMoney(cm.cellValue(row, "Average Earnings per Week"));

  const lane = cm.cellValue(row, "Lane Information") ?? "";
  const favorable = cm.cellValue(row, "Favorable Info on Lane") ?? "";
  const bonus = cm.cellValue(row, "BONUS OFFER") ?? "";
  const descParts = [
    lane,
    favorable ? `Favorable: ${favorable}` : "",
    bonus && bonus !== "NO BONUS OFFER" ? `Bonus: ${bonus}` : "",
  ].filter((s) => s.length > 0);

  // Position title: combine LOB + city/state for at-a-glance identification.
  const lobTag = (lob ?? "").trim();
  const positionTitle = `Swift ${lobTag} — ${geo.city}, ${geo.state}`.trim();

  return {
    ok: true,
    job: {
      externalSourceId: `smartsheet:${sheetId}:${row.id}`,
      positionTitle,
      description: descParts.join(" \n\n"),
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
    },
  };
}

// --- Carrier + job upserts -------------------------------------------------

const SWIFT_CARRIER_NAME = "Swift Transportation";

async function upsertSwiftCarrier(): Promise<string> {
  const existing = await db.query.carriers.findFirst({
    where: eq(schema.carriers.name, SWIFT_CARRIER_NAME),
  });
  if (existing) return existing.id;
  const [row] = await db
    .insert(schema.carriers)
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
    .returning({ id: schema.carriers.id });
  if (!row) throw new Error("failed to insert Swift carrier row");
  return row.id;
}

async function upsertJob(
  carrierId: string,
  job: MappedJob,
): Promise<"inserted" | "updated"> {
  const existing = await db.query.carrierJobs.findFirst({
    where: eq(schema.carrierJobs.externalSourceId, job.externalSourceId),
  });
  if (existing) {
    await db
      .update(schema.carrierJobs)
      .set({
        status: "active",
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
        acceptedHomeTimeTypes:
          job.acceptedHomeTimeTypes as ("daily" | "weekly" | "biweekly" | "otr")[],
        requiredEndorsements: job.requiredEndorsements,
        payRangeMaxWeeklyUsd: job.payRangeMaxWeeklyUsd ?? undefined,
        displayPayRangeMaxWeeklyUsd:
          job.displayPayRangeMaxWeeklyUsd ?? undefined,
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl:
          "https://www.tenstreet.com/apps/swiftcompthird?source=cdla.jobs",
        dataSource: "tenstreet_feed",
        sourceUrl: `https://app.smartsheet.com/sheets/${SHEET_ID_OR_TOKEN}`,
        verificationStatus: "verified",
        dataQuality: "partial",
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.carrierJobs.id, existing.id));
    return "updated";
  }
  await db.insert(schema.carrierJobs).values({
    carrierId,
    status: "active",
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
    acceptedHomeTimeTypes:
      job.acceptedHomeTimeTypes as ("daily" | "weekly" | "biweekly" | "otr")[],
    requiredEndorsements: job.requiredEndorsements,
    payRangeMaxWeeklyUsd: job.payRangeMaxWeeklyUsd ?? undefined,
    displayPayRangeMaxWeeklyUsd: job.displayPayRangeMaxWeeklyUsd ?? undefined,
    applicationSurface: "tenstreet_intelliapp",
    applicationUrl:
      "https://www.tenstreet.com/apps/swiftcompthird?source=cdla.jobs",
    externalSourceId: job.externalSourceId,
    dataSource: "tenstreet_feed",
    sourceUrl: `https://app.smartsheet.com/sheets/${SHEET_ID_OR_TOKEN}`,
    verificationStatus: "verified",
    dataQuality: "partial",
    lastVerifiedAt: new Date(),
  });
  return "inserted";
}

async function archiveStaleSwiftJobs(
  carrierId: string,
  keepIds: string[],
): Promise<number> {
  // Mark any Swift carrier_jobs that have an external_source_id (i.e.,
  // originated from this sync) but aren't in the current pull as archived.
  if (keepIds.length === 0) return 0;
  const result = await db
    .update(schema.carrierJobs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(schema.carrierJobs.carrierId, carrierId),
        isNotNull(schema.carrierJobs.externalSourceId),
        notInArray(schema.carrierJobs.externalSourceId, keepIds),
      ),
    )
    .returning({ id: schema.carrierJobs.id });
  return result.length;
}

// --- Main ------------------------------------------------------------------

async function main() {
  console.log(
    `Sync mode: ${APPLY ? "APPLY (writes to DB)" : "DRY-RUN (no writes)"}`,
  );
  console.log(`Sheet: ${SHEET_ID_OR_TOKEN}`);

  // Fetch the sheet. Smartsheet returns all rows in one call for sheets
  // under ~5000 rows; ours has 312. No pagination needed for v1.
  const sheet = await ssFetch<SsSheet>(`/sheets/${SHEET_ID_OR_TOKEN}`);
  console.log(`Sheet "${sheet.name}" — ${sheet.totalRowCount} rows`);
  const cm = new ColumnMap(sheet.columns);

  const mapped: MappedJob[] = [];
  const skipped: Record<string, number> = {};
  for (const row of sheet.rows) {
    const r = await mapRow(row, cm, sheet.id);
    if (r.ok) {
      mapped.push(r.job);
    } else {
      skipped[r.skip] = (skipped[r.skip] ?? 0) + 1;
    }
  }

  console.log(`\nMapped:  ${mapped.length}`);
  console.log("Skipped reasons:");
  for (const [reason, count] of Object.entries(skipped).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${count.toString().padStart(4)} — ${reason}`);
  }

  // Sample preview — first 5 mapped jobs
  console.log("\nFirst 5 mapped jobs:");
  for (const job of mapped.slice(0, 5)) {
    console.log(
      `  ${job.positionTitle}  |  ${job.equipment}  |  radius=${job.hiringRadiusMiles ?? "OTR"}  |  $${job.payRangeMaxWeeklyUsd ?? "?"}/wk  |  ${job.acceptedHomeTimeTypes.join("/")}`,
    );
  }

  if (!APPLY) {
    console.log("\nDry-run complete. Add --apply to write to the DB.");
    await pg.end();
    return;
  }

  // Apply path
  console.log("\nUpserting Swift carrier...");
  const carrierId = await upsertSwiftCarrier();
  console.log(`  carrier id: ${carrierId}`);

  console.log(`Upserting ${mapped.length} jobs...`);
  let inserted = 0;
  let updated = 0;
  for (const job of mapped) {
    const r = await upsertJob(carrierId, job);
    if (r === "inserted") inserted += 1;
    else updated += 1;
  }
  console.log(`  inserted: ${inserted}, updated: ${updated}`);

  const keepIds = mapped.map((j) => j.externalSourceId);
  const archived = await archiveStaleSwiftJobs(carrierId, keepIds);
  console.log(`  archived (no longer in feed): ${archived}`);

  await pg.end();
}

main().catch(async (err) => {
  console.error("Sync failed:", err);
  await pg.end();
  process.exit(1);
});
