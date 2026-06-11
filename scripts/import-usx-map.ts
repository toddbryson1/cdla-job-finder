// U.S. Xpress importer — sourced from the live Google My Maps doc.
//
// Replaces the stale May-30 CSV import (scripts/import-usx.ts). The map
// has ~243 pins and, crucially, the PAY + bonuses + requirements in each
// pin's sidebar description — which the CSV lacked. Each pin's prose is
// run through an LLM extraction pass to pull structured fields (weekly
// pay range, sign-on bonus, equipment, home time, account/location), then
// upserted via the shared USX writer (scripts/_import-usx-writer.ts).
//
// Map: https://www.google.com/maps/d/u/0/viewer?mid=1aUf320Ipm7XkSGXJ4avGqkxBBNtVin8
//
// Usage:
//   npx tsx scripts/import-usx-map.ts --parse-only     # parse KML, no LLM, no DB (local sanity check)
//   npx tsx scripts/import-usx-map.ts                  # dry-run: parse + LLM extract, print preview, NO DB write
//   npx tsx scripts/import-usx-map.ts --commit         # extract + WRITE to DB (upsert + archive stale)
//   npx tsx scripts/import-usx-map.ts --file /tmp/usx-map.kml   # use a local KML instead of fetching live
//   npx tsx scripts/import-usx-map.ts --limit 5        # only process the first N pins (testing)
//
// Requires (for non-parse-only): ANTHROPIC_API_KEY; for --commit also DATABASE_URL.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

const MAP_MID = "1aUf320Ipm7XkSGXJ4avGqkxBBNtVin8";
const KML_URL = `https://www.google.com/maps/d/kml?mid=${MAP_MID}&forcekml=1`;
const MODEL = "claude-haiku-4-5";
const CONCURRENCY = 8;

// Equipment slugs the matcher understands (carrier_jobs.equipment is free
// text, but must equal a driver's desiredEquipment slug to match).
const EQUIPMENT_SLUGS = [
  "dry-van",
  "reefer",
  "flatbed",
  "tanker",
  "hazmat",
  "auto-hauler",
  "doubles",
  "triples",
  "oversized",
  "dump",
  "mixer",
  "intermodal",
];

interface Args {
  commit: boolean;
  parseOnly: boolean;
  file: string | null;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { commit: false, parseOnly: false, file: null, limit: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--commit") out.commit = true;
    else if (a === "--parse-only") out.parseOnly = true;
    else if (a === "--file") out.file = argv[++i];
    else if (a === "--limit") out.limit = Number(argv[++i]);
  }
  return out;
}

// ----- KML parsing ----------------------------------------------------

interface RawPin {
  name: string;
  description: string;
  lat: string;
  lng: string;
}

function decodeEntities(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function cleanDescription(raw: string): string {
  let s = decodeEntities(raw);
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/[ \t]+/g, " ").replace(/\n[ \t]+/g, "\n").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function extract(body: string, re: RegExp): string | null {
  const m = body.match(re);
  return m ? m[1] : null;
}

function parsePlacemarks(kml: string): { pins: RawPin[]; nonPoint: number } {
  const pins: RawPin[] = [];
  let nonPoint = 0;
  const pmRe = /<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g;
  let m: RegExpExecArray | null;
  while ((m = pmRe.exec(kml)) !== null) {
    const body = m[1];
    const name = decodeEntities(
      (extract(body, /<name>([\s\S]*?)<\/name>/) ?? "").replace(/<[^>]+>/g, ""),
    ).trim();
    const desc = cleanDescription(extract(body, /<description>([\s\S]*?)<\/description>/) ?? "");
    const coordStr = extract(
      body,
      /<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/,
    );
    if (!coordStr) {
      // Polygon/line feature (e.g. a hiring-area shape) — not a job pin.
      nonPoint++;
      continue;
    }
    const [lng, lat] = coordStr.trim().split(/\s*,\s*/).map((x) => x.trim());
    if (!lat || !lng || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      continue;
    }
    pins.push({ name, description: desc, lat, lng });
  }
  return { pins, nonPoint };
}

// ----- LLM extraction -------------------------------------------------

interface Extracted {
  status: "open" | "closed" | "not_a_job";
  position_title: string;
  equipment: string;
  equipment_confidence: "high" | "low";
  accepted_home_time_types: string[];
  pay_min_weekly_usd: number | null;
  pay_max_weekly_usd: number | null;
  sign_on_bonus_usd: number | null;
  domicile_city: string | null;
  domicile_state: string | null;
}

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "usx_job",
  description:
    "Record the structured CDL-A job fields extracted from a U.S. Xpress dedicated-lane map pin. Only fill what the text actually states; never invent numbers.",
  input_schema: {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["open", "closed", "not_a_job"],
        description:
          "'open' = a currently-hiring driver job. 'closed' = the pin is marked CLOSED/filled/no longer hiring (name often starts with CLOSED). 'not_a_job' = an informational pin (trainer qualifications, terminal/legend, policy), not a driver opening.",
      },
      position_title: {
        type: "string",
        description:
          "Concise job title, e.g. 'Dedicated Dry Van — Dollar Tree, Joliet IL'. Use the account/customer + location from the pin.",
      },
      equipment: {
        type: "string",
        enum: EQUIPMENT_SLUGS,
        description:
          "Best equipment slug. USX dedicated accounts (Dollar Tree, Family Dollar, etc.) are usually dry-van. Use 'dry-van' if unclear.",
      },
      equipment_confidence: { type: "string", enum: ["high", "low"] },
      accepted_home_time_types: {
        type: "array",
        items: { type: "string", enum: ["daily", "weekly", "biweekly", "otr"] },
        description:
          "Home-time cadence the lane offers. 'Home daily'/'local' → daily; 'home weekly'/regional → weekly; OTR → otr. Pick all that clearly apply.",
      },
      pay_min_weekly_usd: {
        type: ["number", "null"],
        description:
          "Low end of WEEKLY gross pay in USD if a weekly $ figure or range is stated. If only CPM is given AND weekly miles are stated, you MAY compute weekly = cpm * miles. Otherwise null. Do NOT use the sign-on/retention BONUS as pay.",
      },
      pay_max_weekly_usd: {
        type: ["number", "null"],
        description: "High end of weekly gross pay in USD, else null.",
      },
      sign_on_bonus_usd: {
        type: ["number", "null"],
        description: "Sign-on bonus in USD if stated (e.g. $2500 Sign On Bonus), else null.",
      },
      domicile_city: { type: ["string", "null"], description: "City if stated, else null." },
      domicile_state: {
        type: ["string", "null"],
        description: "2-letter state if stated (e.g. IL), else null.",
      },
    },
    required: [
      "status",
      "position_title",
      "equipment",
      "equipment_confidence",
      "accepted_home_time_types",
      "pay_min_weekly_usd",
      "pay_max_weekly_usd",
      "sign_on_bonus_usd",
      "domicile_city",
      "domicile_state",
    ],
  },
};

async function extractPin(
  client: Anthropic,
  pin: RawPin,
): Promise<Extracted | null> {
  const prompt = `Extract the CDL-A job fields from this U.S. Xpress dedicated-lane map pin.

PIN NAME: ${pin.name}

PIN DETAILS:
${pin.description.slice(0, 4000)}`;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 700,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "usx_job" },
      messages: [{ role: "user", content: prompt }],
    });
    const tu = res.content.find((c) => c.type === "tool_use");
    if (!tu || tu.type !== "tool_use") return null;
    return tu.input as Extracted;
  } catch (err) {
    console.error(`  extract failed for "${pin.name}":`, err instanceof Error ? err.message : err);
    return null;
  }
}

// Simple concurrency-limited map.
async function pool<T, R>(items: T[], n: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// ----- PreparedJob assembly ------------------------------------------

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
}

function pinKey(pin: RawPin): string {
  return (
    "usx:map:" +
    createHash("sha256").update(`${pin.name}|${pin.lat}|${pin.lng}`).digest("hex").slice(0, 16)
  );
}

function buildJob(pin: RawPin, ex: Extracted): PreparedJob {
  // Every lane gets a real hiring radius (no null radius — see migration
  // 0039). Local lanes recruit tight (40mi), regional/OTR wider (75mi).
  const homeTimes =
    ex.accepted_home_time_types.length > 0 ? ex.accepted_home_time_types : ["weekly"];
  const isLocal = homeTimes.length > 0 && homeTimes.every((h) => h === "daily");
  const radius = isLocal ? 40 : 75;

  const hasPay = ex.pay_min_weekly_usd != null || ex.pay_max_weekly_usd != null;
  const quality: PreparedJob["dataQuality"] =
    hasPay && ex.equipment_confidence === "high" ? "complete" : hasPay ? "partial" : "minimal";

  const equipment = EQUIPMENT_SLUGS.includes(ex.equipment) ? ex.equipment : "dry-van";

  return {
    externalSourceId: pinKey(pin),
    positionTitle: ex.position_title?.slice(0, 200) || pin.name || "U.S. Xpress Dedicated",
    description: pin.description.slice(0, 6000),
    domicileCity: ex.domicile_city,
    domicileState: ex.domicile_state,
    domicileLat: pin.lat,
    domicileLng: pin.lng,
    hiringPolygonWkt: null,
    hiringRadiusMiles: radius,
    equipment,
    equipmentConfidence: ex.equipment_confidence,
    acceptedHomeTimeTypes: homeTimes,
    payMin: ex.pay_min_weekly_usd,
    payMax: ex.pay_max_weekly_usd,
    signOnBonus: ex.sign_on_bonus_usd,
    dataQuality: quality,
    domicileFlag: null,
  };
}

// ----- main -----------------------------------------------------------

async function fetchKml(file: string | null): Promise<string> {
  if (file) {
    console.log(`Reading KML from ${file}`);
    return readFileSync(file, "utf-8");
  }
  console.log(`Fetching live map KML: ${KML_URL}`);
  const res = await fetch(KML_URL);
  if (!res.ok) throw new Error(`KML fetch failed: ${res.status}`);
  return res.text();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const kml = await fetchKml(args.file);
  const { pins: allPins, nonPoint } = parsePlacemarks(kml);
  const pins = args.limit ? allPins.slice(0, args.limit) : allPins;
  console.log(`Parsed ${allPins.length} job pins (+${nonPoint} non-point features skipped)`);

  if (args.parseOnly) {
    console.log("\n--parse-only: sample of first 3 pins:");
    for (const p of pins.slice(0, 3)) {
      console.log(`\n• ${p.name}  [${p.lat}, ${p.lng}]`);
      console.log(`  ${p.description.slice(0, 200).replace(/\n/g, " ")}…`);
    }
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY not set — required for extraction.");
    process.exit(1);
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Pre-filter: a "CLOSED …" name prefix is the operator's convention for a
  // filled/closed lane — skip those without spending an LLM call.
  const candidates = pins.filter(
    (p) => !p.name.trim().toUpperCase().startsWith("CLOSED"),
  );
  const closedByName = pins.length - candidates.length;
  console.log(
    `${closedByName} pins marked CLOSED by name (skipped). Extracting ${candidates.length} candidates via ${MODEL} (concurrency ${CONCURRENCY})…`,
  );

  let closedByLlm = 0;
  let notJob = 0;
  let failures = 0;
  const built = await pool(candidates, CONCURRENCY, async (pin, i) => {
    const ex = await extractPin(client, pin);
    if ((i + 1) % 20 === 0) console.log(`  …${i + 1}/${candidates.length}`);
    if (!ex) {
      failures++;
      return null;
    }
    if (ex.status === "closed") {
      closedByLlm++;
      return null;
    }
    if (ex.status === "not_a_job") {
      notJob++;
      return null;
    }
    return buildJob(pin, ex);
  });
  const jobs = built.filter((j): j is PreparedJob => j !== null);

  const withPay = jobs.filter((j) => j.payMin != null || j.payMax != null).length;
  const withBonus = jobs.filter((j) => j.signOnBonus != null).length;
  console.log(
    `\nOpen jobs: ${jobs.length}  |  closed(name): ${closedByName}  closed(LLM): ${closedByLlm}  not-a-job: ${notJob}  failures: ${failures}`,
  );
  console.log(
    `${withPay}/${jobs.length} have weekly pay, ${withBonus} have a sign-on bonus.`,
  );

  console.log("\nSample (first 5):");
  for (const j of jobs.slice(0, 5)) {
    console.log(
      `  • ${j.positionTitle} — ${j.equipment} — pay ${j.payMin ?? "?"}-${j.payMax ?? "?"}/wk` +
        `${j.signOnBonus ? ` +$${j.signOnBonus} SOB` : ""} — ${j.acceptedHomeTimeTypes.join("/")} — ${j.hiringRadiusMiles}mi`,
    );
  }

  if (!args.commit) {
    console.log("\nDRY RUN — no DB writes. Re-run with --commit to upsert + archive stale USX jobs.");
    return;
  }

  if (jobs.length === 0) {
    console.error("Refusing to commit 0 jobs (would archive everything). Aborting.");
    process.exit(1);
  }

  console.log("\nWriting to DB…");
  const { writeAll, deactivateUsxJobsNotIn } = await import("./_import-usx-writer");
  await writeAll(jobs);
  const archived = await deactivateUsxJobsNotIn(jobs.map((j) => j.externalSourceId));
  console.log(`Archived ${archived} stale USX jobs no longer on the map (incl. old CSV import).`);
  console.log("Done.");
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
