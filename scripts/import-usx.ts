// U.S. Xpress carrier + 85-job importer.
//
// Reads:
//   data/carriers/usx/usx-open-jobs-2026-05-30.csv    (85 rows)
//   data/carriers/usx/usx-hiring-map-2026-05-30.kml   (polygon source)
//
// Produces:
//   - 1 carriers row (status=paused, partner) if missing
//   - 85 carrier_jobs rows applying USX company-wide rules from
//     docs/CARRIER_usx-rules-mapping-v1.md
//   - data/carriers/usx/LOAD_REPORT_2026-05-30.md
//
// Carrier ships PAUSED. Driver matching is gated on
// carriers.status='active'; we never set that here. The audit +
// flip-to-active is a separate session per the build prompt.
//
// Idempotent. external_source_id format: usx:csv:USX-NNNN.
// Re-running upserts existing rows by that key.
//
// Usage:
//   npx tsx scripts/import-usx.ts                    # dry-run (default)
//   npx tsx scripts/import-usx.ts --commit           # actually write
//   npx tsx scripts/import-usx.ts --report PATH      # override report path

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ----- CLI args --------------------------------------------------

interface Args {
  commit: boolean;
  reportPath: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    commit: false,
    reportPath: "data/carriers/usx/LOAD_REPORT_2026-05-30.md",
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") out.commit = true;
    else if (a === "--report") out.reportPath = argv[++i];
  }
  return out;
}

// ----- Sources ---------------------------------------------------

const CSV_PATH = "data/carriers/usx/usx-open-jobs-2026-05-30.csv";
const KML_PATH = "data/carriers/usx/usx-hiring-map-2026-05-30.kml";

// ----- USX company-wide rules (from CARRIER_usx-rules-mapping-v1.md)

const USX_RULES = {
  // Hard-filter (Path A + Path B)
  minExperienceMonths: 3,
  minExperienceMonthsLifetime: 12,
  minExperienceMonthsLifetimeWindowMonths: 120,
  acceptedCdlStates: [] as string[],
  requiredEndorsements: [] as string[],
  acceptsTerminated: true, // conditional 6-month safe-driving — surfaced in description
  acceptsFailedDotTest: false,
  sapTolerance: "accepts_none" as const,
  // Stage 2
  maxTickets3yr: 2,
  maxAccidents3yr: 3,
  maxAtFaultAccidents3yr: 1,
  acceptsDui: true,
  duiMaxRecencyMonths: 120,
  acceptsFelony: true,
  // Application surface
  applicationUrl:
    "https://intelliapp.driverapponline.com/c/usxpress?r=chineithanableDLMPRO&release_signature_screen_submit_without_signing=y&uri_b=ia_usxpress_530409652",
  applicationSurface: "tenstreet_intelliapp" as const,
  publicCareersUrl: "https://www.usxpress.com/drivers",
  sourceUrl:
    "https://www.google.com/maps/d/u/0/viewer?mid=1aUf320Ipm7XkSGXJ4avGqkxBBNtVin8",
};

// ----- CSV parsing (RFC 4180 simplified) -------------------------

/**
 * Tiny RFC 4180-ish CSV parser. Handles quoted fields with embedded
 * commas, newlines, and "" escape pairs. Returns rows as
 * arrays-of-strings; the caller maps to header indices.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }
    if (c === "\r") continue;
    field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

type CsvRow = Record<string, string>;

function loadCsv(): CsvRow[] {
  const text = readFileSync(CSV_PATH, "utf-8");
  const rows = parseCsv(text);
  const headers = rows[0];
  return rows.slice(1).map((cols) => {
    const r: CsvRow = {};
    headers.forEach((h, i) => {
      r[h] = (cols[i] ?? "").trim();
    });
    return r;
  });
}

// ----- KML polygon parsing ---------------------------------------

interface PolygonEntry {
  folder: string;
  placemarkName: string;
  /** WKT in form `POLYGON((lng lat, lng lat, ...))` — SRID prefix added at insert. */
  wkt: string;
}

/**
 * Walks the KML file folder-by-folder, then placemark-by-placemark,
 * collecting (folder, placemark name, polygon) tuples. Uses
 * line-tracking on regex-extracted `<Folder>...</Folder>` and
 * `<Placemark>...</Placemark>` blocks so we can attribute each
 * placemark to its containing folder.
 */
function loadKmlPolygons(): PolygonEntry[] {
  const text = readFileSync(KML_PATH, "utf-8");
  const out: PolygonEntry[] = [];

  // Split into top-level folder chunks. KML structure:
  //   <Folder>
  //     <name>...</name>
  //     <Placemark>...</Placemark>
  //     ...
  //   </Folder>
  const folderRe = /<Folder>([\s\S]*?)<\/Folder>/g;
  let m: RegExpExecArray | null;
  while ((m = folderRe.exec(text))) {
    const folderXml = m[1];
    const folderNameMatch = folderXml.match(/<name>([\s\S]*?)<\/name>/);
    const folderName = folderNameMatch
      ? cleanXmlText(folderNameMatch[1])
      : "(unknown folder)";

    const placemarkRe = /<Placemark>([\s\S]*?)<\/Placemark>/g;
    let pmMatch: RegExpExecArray | null;
    while ((pmMatch = placemarkRe.exec(folderXml))) {
      const pmXml = pmMatch[1];
      const nameMatch = pmXml.match(/<name>([\s\S]*?)<\/name>/);
      const placemarkName = nameMatch ? cleanXmlText(nameMatch[1]) : "";

      // We only care about Polygon placemarks; Point placemarks
      // exist too (centroid pins) but the CSV already has those
      // coordinates separately.
      const polygonMatch = pmXml.match(/<Polygon>[\s\S]*?<\/Polygon>/);
      if (!polygonMatch) continue;

      const coordsMatch = polygonMatch[0].match(
        /<coordinates>([\s\S]*?)<\/coordinates>/,
      );
      if (!coordsMatch) continue;

      const wkt = kmlCoordinatesToWkt(coordsMatch[1]);
      if (wkt) {
        out.push({ folder: folderName, placemarkName, wkt });
      }
    }
  }
  return out;
}

function cleanXmlText(text: string): string {
  return text
    .replace(/<!\[CDATA\[/g, "")
    .replace(/\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert KML `<coordinates>` text to PostGIS WKT POLYGON ring text.
 * KML emits `lng,lat,alt` triples separated by whitespace; WKT wants
 * `lng lat` pairs comma-separated, with the ring closed (first =
 * last). Returns null if the polygon is malformed or has <4 points.
 */
function kmlCoordinatesToWkt(coordsText: string): string | null {
  const points: Array<[number, number]> = [];
  const tokens = coordsText.trim().split(/\s+/);
  for (const tok of tokens) {
    if (!tok) continue;
    const parts = tok.split(",");
    if (parts.length < 2) return null;
    const lng = Number(parts[0]);
    const lat = Number(parts[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
    points.push([lng, lat]);
  }
  if (points.length < 3) return null;
  // Close the ring if KML left it open.
  const first = points[0];
  const last = points[points.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    points.push([first[0], first[1]]);
  }
  if (points.length < 4) return null;
  const ring = points.map(([lng, lat]) => `${lng} ${lat}`).join(", ");
  return `POLYGON((${ring}))`;
}

// ----- Polygon lookup --------------------------------------------

/**
 * Build a `Map<key, wkt>` keyed by normalized "folder|placemark".
 * Normalization mirrors `cleanXmlText` so CSV strings and KML strings
 * compare cleanly regardless of leading/trailing whitespace +
 * emoji preservation.
 */
function buildPolygonLookup(
  polygons: PolygonEntry[],
): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of polygons) {
    const key = `${normalize(p.folder)}|${normalize(p.placemarkName)}`;
    m.set(key, p.wkt);
  }
  return m;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ----- Equipment heuristic ---------------------------------------

/**
 * USX is overwhelmingly dry-van. Specialized Fleets folders include
 * flatbed + reefer + tanker variants; we sniff the title for
 * keywords. Returns the equipment slug + confidence flag for the
 * load report.
 */
function deriveEquipment(row: CsvRow): {
  slug: string;
  confidence: "high" | "low";
} {
  const folder = row.usx_folder ?? "";
  const blob = `${row.placemark_name ?? ""} ${row.description_full ?? ""}`.toLowerCase();

  if (/specialized/i.test(folder)) {
    if (/flatbed|flat\s*bed/.test(blob)) return { slug: "flatbed", confidence: "high" };
    if (/reefer|refrigerated/.test(blob)) return { slug: "reefer", confidence: "high" };
    if (/tanker|tank/.test(blob)) return { slug: "tanker", confidence: "high" };
    if (/oversized|heavy haul/.test(blob)) return { slug: "oversized", confidence: "high" };
    // Specialized but ambiguous — flag for review.
    return { slug: "dry-van", confidence: "low" };
  }
  return { slug: "dry-van", confidence: "high" };
}

// ----- Domicile parsing ------------------------------------------

// USX accounts are "Customer + city [+ state]" rather than
// "city, state". A few examples from the actual CSV:
//   "DT Joliet, IL"             → DT (Dollar Tree), Joliet, IL
//   "DT Warrensburg MO"         → DT, Warrensburg, MO  (no comma)
//   "Kroger Roanoke VA"         → Kroger, Roanoke, VA
//   "Family Dollar Front Royal" → FD, Front Royal     (no state)
//   "Walmart Henderson NC -"    → trailing dash junk
const CUSTOMER_PREFIXES = [
  // Multi-word prefixes first so they match before their single-token
  // aliases (e.g. "Dollar Tree" before "DT" stripping would catch
  // "Dollar Tree Savannah" cleanly).
  "Dollar Tree", // alias DT
  "Dollar General", // some sources use this
  "Family Dollar", // alias FD
  "Tractor Supply", // alias TSC
  "FD",
  "DT",
  "TSC",
  "Kroger",
  "Walmart",
  "Target",
  "Meijer",
  "Whirlpool",
  "Staples",
  "Costco",
];

const US_STATE_CODES = new Set([
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC",
]);

function parseDomicile(raw: string): {
  city: string | null;
  state: string | null;
  flag: string | null;
} {
  let r = raw.trim();
  if (!r) return { city: null, state: null, flag: "empty domicile_raw" };

  // Strip trailing junk: trailing dashes, "Regional", "Based", etc.
  r = r.replace(/\s*-\s*$/, "");
  r = r.replace(/\s+(Regional|Based|Dedicated|Local|OTR)\s*$/i, "");

  // Strip leading customer prefix if present.
  for (const prefix of CUSTOMER_PREFIXES) {
    const re = new RegExp(`^${prefix.replace(/\s+/g, "\\s+")}\\s+`, "i");
    if (re.test(r)) {
      r = r.replace(re, "");
      break;
    }
  }

  // Now we should have "city" or "city, state" or "city state".
  // Try "city, state" first.
  const commaMatch = r.match(/^(.+?),\s*([A-Z]{2})\s*$/i);
  if (commaMatch) {
    const state = commaMatch[2].toUpperCase();
    if (US_STATE_CODES.has(state)) {
      return { city: commaMatch[1].trim(), state, flag: null };
    }
  }

  // Try "city STATE" (trailing 2-letter token).
  const trailingMatch = r.match(/^(.+?)\s+([A-Z]{2})\s*$/);
  if (trailingMatch) {
    const state = trailingMatch[2].toUpperCase();
    if (US_STATE_CODES.has(state)) {
      return { city: trailingMatch[1].trim(), state, flag: null };
    }
  }

  // No recognizable state — return city only.
  if (r.length > 0) {
    return { city: r, state: null, flag: `no state in ${raw}` };
  }
  return { city: null, state: null, flag: `unparseable: ${raw.slice(0, 40)}` };
}

// ----- Data quality enum -----------------------------------------

function deriveDataQuality(input: {
  city: string | null;
  state: string | null;
  polygonWkt: string | null;
  payMin: number | null;
  payMax: number | null;
  equipment: string | null;
}): "complete" | "partial" | "minimal" {
  const hasCore =
    Boolean(input.city) &&
    Boolean(input.state) &&
    input.polygonWkt != null &&
    input.payMin != null &&
    input.payMax != null &&
    Boolean(input.equipment);
  if (hasCore) return "complete";
  if ((input.city && input.state) || input.polygonWkt) return "partial";
  return "minimal";
}

// ----- Dedup detection (trigram ratio) ---------------------------

function trigrams(s: string): Set<string> {
  const tris = new Set<string>();
  const padded = `  ${s.toLowerCase()}  `;
  for (let i = 0; i < padded.length - 2; i++) {
    tris.add(padded.slice(i, i + 3));
  }
  return tris;
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = ta.size + tb.size - intersection;
  return intersection / union;
}

// ----- Build prepared job rows -----------------------------------

interface PreparedJob {
  externalSourceId: string;
  positionTitle: string;
  description: string;
  domicileCity: string | null;
  domicileState: string | null;
  domicileLat: string | null;
  domicileLng: string | null;
  hiringPolygonWkt: string | null;
  hiringRadiusMiles: number | null;
  equipment: string;
  equipmentConfidence: "high" | "low";
  acceptedHomeTimeTypes: string[];
  payMin: number | null;
  payMax: number | null;
  signOnBonus: number | null;
  dataQuality: "complete" | "partial" | "minimal";
  domicileFlag: string | null;
  // For dedup detection.
  descriptionSummary: string;
  domicileRaw: string;
}

function buildPreparedJob(
  row: CsvRow,
  polygonLookup: Map<string, string>,
  reportFlags: ReportFlags,
): PreparedJob {
  const id = row.usx_job_id;
  const polygonKey = `${normalize(row.usx_folder)}|${normalize(row.placemark_name)}`;
  const polygonWkt = polygonLookup.get(polygonKey) ?? null;
  if (!polygonWkt) reportFlags.unmatchedPolygons.push(id);

  const { city, state, flag: domicileFlag } = parseDomicile(
    row.domicile_raw,
  );
  if (domicileFlag) {
    // Distinguish truly unparseable (no city extracted) from "city
    // parsed but no state" (~70% of USX rows due to "Customer City"
    // naming with no state code). The writer fills missing state
    // from a nearest-zip lookup at commit time.
    if (!city) {
      reportFlags.unparseableDomiciles.push(`${id}: ${domicileFlag}`);
    } else if (!state) {
      reportFlags.missingStateOnly.push(`${id}: ${row.domicile_raw}`);
    }
  }

  // Map USX's CSV home-time values to our home_time enum. USX's
  // "varies" maps to the union of weekly + biweekly so any non-OTR
  // weekly-ish driver matches; "home_daily"/"home_weekly" lose the
  // "home_" prefix.
  const homeTimeMapped = mapHomeTime(row.home_time);
  void homeTimeMapped; // used below via row.home_time replacement

  const equipment = deriveEquipment(row);
  if (equipment.confidence === "low")
    reportFlags.lowConfidenceEquipment.push(id);

  const lat = row.lane_polygon_centroid_lat;
  const lng = row.lane_polygon_centroid_lng;

  const payMin = parseIntOrNull(row.weekly_pay_min_usd);
  const payMax = parseIntOrNull(row.weekly_pay_max_usd);
  const signOnBonus = parseIntOrNull(row.sign_on_bonus_usd);

  return {
    externalSourceId: `usx:csv:${id}`,
    positionTitle: row.placemark_name.slice(0, 200),
    description: row.description_full,
    domicileCity: city,
    domicileState: state,
    domicileLat: lat || null,
    domicileLng: lng || null,
    hiringPolygonWkt: polygonWkt,
    hiringRadiusMiles: null, // polygon takes precedence
    equipment: equipment.slug,
    equipmentConfidence: equipment.confidence,
    acceptedHomeTimeTypes: homeTimeMapped,
    payMin,
    payMax,
    signOnBonus,
    dataQuality: deriveDataQuality({
      city,
      state,
      polygonWkt,
      payMin,
      payMax,
      equipment: equipment.slug,
    }),
    domicileFlag,
    descriptionSummary: row.description_full.slice(0, 500),
    domicileRaw: row.domicile_raw,
  };
}

/**
 * USX CSV uses "home_weekly", "home_daily", "otr", "varies". The
 * home_time Postgres enum is `daily | weekly | biweekly | otr`.
 * "varies" mirrors the Swift sync convention: a job that doesn't
 * commit to a single home-time gets the safest non-OTR set so any
 * non-OTR weekly-or-biweekly driver's home-time array overlaps.
 */
function mapHomeTime(
  raw: string,
): Array<"daily" | "weekly" | "biweekly" | "otr"> {
  switch (raw) {
    case "home_daily":
      return ["daily"];
    case "home_weekly":
      return ["weekly"];
    case "otr":
      return ["otr"];
    case "varies":
      return ["weekly", "biweekly"];
    default:
      // Defensive: unknown → empty array. The matcher's home-time
      // overlap check will then fail closed. Won't happen in
      // practice; if it does, the load report flags it via the
      // generic data-quality bucket.
      return [];
  }
}

function parseIntOrNull(s: string | undefined): number | null {
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// ----- Report flags ----------------------------------------------

interface ReportFlags {
  unmatchedPolygons: string[];
  unparseableDomiciles: string[];
  /** City parsed, state missing — will be resolved via nearest-zip lookup at commit time. */
  missingStateOnly: string[];
  lowConfidenceEquipment: string[];
  suspectedDuplicates: Array<{ a: string; b: string; ratio: number }>;
  nullCriticalRows: string[];
}

function newReportFlags(): ReportFlags {
  return {
    unmatchedPolygons: [],
    unparseableDomiciles: [],
    missingStateOnly: [],
    lowConfidenceEquipment: [],
    suspectedDuplicates: [],
    nullCriticalRows: [],
  };
}

// ----- Main ------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const csvAbs = resolve(CSV_PATH);
  const kmlAbs = resolve(KML_PATH);
  console.log(`USX ingestion — ${args.commit ? "COMMIT" : "DRY-RUN"}\n`);
  console.log(`CSV: ${csvAbs}`);
  console.log(`KML: ${kmlAbs}\n`);

  // Parse sources.
  const csvRows = loadCsv();
  console.log(`Parsed CSV: ${csvRows.length} rows`);
  const kmlPolygons = loadKmlPolygons();
  console.log(`Parsed KML: ${kmlPolygons.length} polygons`);
  const polygonLookup = buildPolygonLookup(kmlPolygons);

  // Build prepared rows + collect flags.
  const flags = newReportFlags();
  const prepared = csvRows.map((r) => buildPreparedJob(r, polygonLookup, flags));

  // Critical-null detection: any row with no description OR no
  // (lat & lng) AND no polygon. The schema requires lat/lng to NOT
  // be null on insert.
  for (const p of prepared) {
    const id = p.externalSourceId;
    const noLocation =
      !p.domicileLat ||
      !p.domicileLng ||
      Number.isNaN(Number(p.domicileLat)) ||
      Number.isNaN(Number(p.domicileLng));
    if (!p.description || (noLocation && !p.hiringPolygonWkt)) {
      flags.nullCriticalRows.push(id);
    }
  }

  // Suspected-duplicate detection.
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      if (prepared[i].domicileRaw !== prepared[j].domicileRaw) continue;
      if (!prepared[i].descriptionSummary || !prepared[j].descriptionSummary)
        continue;
      const r = similarity(
        prepared[i].descriptionSummary,
        prepared[j].descriptionSummary,
      );
      if (r > 0.7) {
        flags.suspectedDuplicates.push({
          a: prepared[i].externalSourceId,
          b: prepared[j].externalSourceId,
          ratio: Math.round(r * 1000) / 1000,
        });
      }
    }
  }

  // Build per-field null counts.
  const nullCounts: Record<string, number> = {
    domicile_city: 0,
    domicile_state: 0,
    hiring_polygon: 0,
    weekly_pay_min: 0,
    weekly_pay_max: 0,
    sign_on_bonus: 0,
  };
  for (const p of prepared) {
    if (!p.domicileCity) nullCounts.domicile_city++;
    if (!p.domicileState) nullCounts.domicile_state++;
    if (!p.hiringPolygonWkt) nullCounts.hiring_polygon++;
    if (p.payMin == null) nullCounts.weekly_pay_min++;
    if (p.payMax == null) nullCounts.weekly_pay_max++;
    if (p.signOnBonus == null) nullCounts.sign_on_bonus++;
  }

  // Equipment breakdown.
  const equipmentBreakdown: Record<string, number> = {};
  for (const p of prepared) {
    equipmentBreakdown[p.equipment] =
      (equipmentBreakdown[p.equipment] ?? 0) + 1;
  }

  // Data-quality breakdown.
  const qualityBreakdown: Record<string, number> = {
    complete: 0,
    partial: 0,
    minimal: 0,
  };
  for (const p of prepared) qualityBreakdown[p.dataQuality]++;

  console.log("");
  console.log(`Prepared ${prepared.length} jobs`);
  console.log(
    `  polygon-matched : ${prepared.length - flags.unmatchedPolygons.length}`,
  );
  console.log(`  polygon-missing : ${flags.unmatchedPolygons.length}`);
  console.log(
    `  unparseable dom : ${flags.unparseableDomiciles.length} (truly broken)`,
  );
  console.log(
    `  missing-state   : ${flags.missingStateOnly.length} (resolved at commit via nearest-zip)`,
  );
  console.log(
    `  low-conf equip  : ${flags.lowConfidenceEquipment.length}`,
  );
  console.log(`  suspected dupes : ${flags.suspectedDuplicates.length}`);
  console.log(`  critical null   : ${flags.nullCriticalRows.length}`);
  console.log(`  data_quality    : ${JSON.stringify(qualityBreakdown)}`);

  // Write the load report regardless of commit mode.
  const report = renderLoadReport({
    args,
    csvRows,
    prepared,
    flags,
    nullCounts,
    equipmentBreakdown,
    qualityBreakdown,
  });
  writeFileSync(args.reportPath, report, "utf-8");
  console.log(`\nLoad report → ${args.reportPath}`);

  if (!args.commit) {
    console.log("\nDRY-RUN — no DB writes. Re-run with --commit to insert.");
    return;
  }

  // Commit path: lazy-load DB so dotenv has run.
  console.log("\nCommitting to database…");
  const { writeAll } = await import("./_import-usx-writer");
  await writeAll(prepared);
  console.log(`Done. ${prepared.length} jobs upserted; carrier paused.`);
}

interface ReportInput {
  args: Args;
  csvRows: CsvRow[];
  prepared: PreparedJob[];
  flags: ReportFlags;
  nullCounts: Record<string, number>;
  equipmentBreakdown: Record<string, number>;
  qualityBreakdown: Record<string, number>;
}

function renderLoadReport(input: ReportInput): string {
  const { prepared, flags, nullCounts, equipmentBreakdown, qualityBreakdown } =
    input;
  const lines: string[] = [];
  lines.push("# U.S. Xpress Load Report — 2026-05-30");
  lines.push("");
  lines.push(
    `Generated ${new Date().toISOString()} (${input.args.commit ? "COMMIT" : "DRY-RUN"} mode).`,
  );
  lines.push("");
  lines.push("## 1. Carriers row");
  lines.push("");
  lines.push("- name: `U.S. Xpress`");
  lines.push("- kind: `partner`");
  lines.push("- tier: `none`");
  lines.push("- status: `paused`  ← do not flip without audit");
  lines.push("- public_careers_url: `https://www.usxpress.com/drivers`");
  lines.push("- legal_name: `null` — Todd to provide");
  lines.push("- fmcsa_dot_number / fmcsa_mc_number: `null` — Todd to provide");
  lines.push("- tenstreet_account_id: `null`");
  lines.push("");
  lines.push("## 2. Carrier_jobs counts");
  lines.push("");
  lines.push(`- Total prepared: ${prepared.length}`);
  lines.push(`- Polygon-matched: ${prepared.length - flags.unmatchedPolygons.length}`);
  lines.push(
    `- Polygon-missing (fell back to centroid only): ${flags.unmatchedPolygons.length}`,
  );
  lines.push("");
  lines.push("## 3. Per-field null counts");
  lines.push("");
  for (const [k, v] of Object.entries(nullCounts)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  lines.push("## 4. Equipment breakdown");
  lines.push("");
  for (const [k, v] of Object.entries(equipmentBreakdown).sort(
    (a, b) => b[1] - a[1],
  )) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  lines.push("## 5. Data-quality breakdown");
  lines.push("");
  for (const [k, v] of Object.entries(qualityBreakdown)) {
    lines.push(`- ${k}: ${v}`);
  }
  lines.push("");
  lines.push("## 6. Polygon mismatches (no KML polygon for CSV row)");
  lines.push("");
  if (flags.unmatchedPolygons.length === 0) {
    lines.push("None.");
  } else {
    for (const id of flags.unmatchedPolygons) lines.push(`- ${id}`);
  }
  lines.push("");
  lines.push("## 7. Unparseable domiciles (truly broken)");
  lines.push("");
  if (flags.unparseableDomiciles.length === 0) {
    lines.push("None.");
  } else {
    for (const s of flags.unparseableDomiciles) lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push(
    "## 7b. Missing state (city parsed, state resolved at commit time via nearest-zip lookup)",
  );
  lines.push("");
  if (flags.missingStateOnly.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      `The writer reverse-geocodes polygon centroid → nearest zip → state for these ${flags.missingStateOnly.length} rows.`,
    );
    lines.push("");
    for (const s of flags.missingStateOnly) lines.push(`- ${s}`);
  }
  lines.push("");
  lines.push("## 8. Low-confidence equipment (Specialized Fleets fallback to dry-van)");
  lines.push("");
  if (flags.lowConfidenceEquipment.length === 0) {
    lines.push("None.");
  } else {
    for (const id of flags.lowConfidenceEquipment) lines.push(`- ${id}`);
  }
  lines.push("");
  lines.push("## 9. Suspected duplicates (same domicile_raw + >70% description similarity)");
  lines.push("");
  if (flags.suspectedDuplicates.length === 0) {
    lines.push("None.");
  } else {
    lines.push(
      "These pairs may represent the same physical job posted under two home-time categories.",
    );
    lines.push(
      "Per the build prompt we keep all rows; manual cleanup happens during audit.",
    );
    lines.push("");
    for (const d of flags.suspectedDuplicates) {
      lines.push(`- ${d.a}  ↔  ${d.b}  (ratio ${d.ratio})`);
    }
  }
  lines.push("");
  lines.push("## 10. Critical-null rows (no description OR no lat/lng AND no polygon)");
  lines.push("");
  if (flags.nullCriticalRows.length === 0) {
    lines.push("None.");
  } else {
    for (const id of flags.nullCriticalRows) lines.push(`- ${id}`);
  }
  lines.push("");
  lines.push("## 11. Decisions made that weren't fully specified");
  lines.push("");
  lines.push(
    "- KML parsing: regex-based extraction (no XML library dep). KML is well-formed enough.",
  );
  lines.push(
    "- Dedup similarity: hand-rolled trigram ratio at 0.70 threshold (no external lib).",
  );
  lines.push(
    "- Equipment heuristic for Specialized Fleets: title/description scan for flatbed/reefer/tanker keywords; fall back to `dry-van` with `confidence: low` flag (see §8).",
  );
  lines.push(
    "- domicile_state when ambiguous (e.g. `DUNCAN`, `Chicago Based`): null + flag in §7.",
  );
  lines.push(
    "- Idempotency: external_source_id = `usx:csv:USX-NNNN`, ON CONFLICT DO UPDATE.",
  );
  lines.push(
    "- Carrier ships PAUSED — do not flip to active without audit session.",
  );
  lines.push("");
  lines.push("## 12. Follow-ups before flipping to active");
  lines.push("");
  lines.push("- Todd: confirm `legal_name`, `fmcsa_dot_number`, `fmcsa_mc_number`.");
  lines.push("- Todd: review suspected duplicates in §9 and merge or accept.");
  lines.push(
    "- Todd: confirm Specialized Fleets equipment (§8) — some may be flatbed/reefer/tanker even when keyword detection fell back to dry-van.",
  );
  lines.push(
    "- Todd: review unparseable domiciles in §7 — fill in city/state manually before publishing.",
  );
  lines.push(
    "- Todd: review polygon-missing rows in §6 — without polygon and with `hiring_radius_miles = null`, those jobs only match OTR drivers; may need radius backfill if the carrier expects non-OTR matches.",
  );
  lines.push("");
  return lines.join("\n");
}

main().catch((err) => {
  console.error("[import-usx] failed:", err);
  process.exit(1);
});
