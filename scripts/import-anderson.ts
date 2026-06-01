// Anderson Trucking Service (ATS) carrier + 4-job importer.
//
// Reads data/carriers/anderson.csv — 4 rows, all St. Cloud MN
// domicile — and upserts them into carrier_jobs after ensuring
// the "Anderson Trucking Service" carriers row exists with the
// partner_handoff_config blob from spec §B4.5.
//
// Idempotent. The external_source_id format is
//   anderson:csv:<carrier_internal_job_id>
// Re-runs upsert in place; rows present in the DB but not in the
// current CSV are archived (matches the Swift/CRE pattern).
//
// Per spec docs/SPEC_anderson-application-handoff-addendum-v2.md
// §B4.2-B4.5. Hiring criteria come directly from the ATS Driver
// Qualification Guidelines (revision 03-23-2026) and the Pre-Qual
// Sheet that the spec is sourced from.
//
// Usage:
//   npx tsx scripts/import-anderson.ts           # dry-run summary
//   npx tsx scripts/import-anderson.ts --apply   # write to DB

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";

const ANDERSON_CSV_DEFAULT = "data/carriers/anderson.csv";

// Carrier-level metadata from spec §B4.1.
const ANDERSON_CARRIER = {
  name: "Anderson Trucking Service",
  // Flagged in commit message for human SAFER verification.
  legalName: "Anderson Trucking Service, Inc.",
  kind: "partner" as const,
  tier: "none" as const,
  status: "active" as const,
  publicCareersUrl: "https://www.drive4ats.com/",
  tenstreetAccountId: "anderson",
  // 725 Opportunity Dr., St. Cloud, MN 56301 — same as the carrier-jobs
  // domicile lat/lng since all 4 rows operate out of HQ.
  businessAddressLat: "45.5579",
  businessAddressLng: "-94.1632",
};

// Per spec §B4.5 — partner_handoff_config blob, verbatim.
const ANDERSON_PARTNER_HANDOFF_CONFIG = {
  handoff_type: "anderson_quickbase",
  intelliapp_url:
    "https://intelliapp.driverapponline.com/c/anderson?r=CDL%20Hunterl&uri_b=ia_anderson_795672276",
  recruiter_param_value: "CDL Hunterl",
  source_identifier: "ia_anderson_795672276",
  quickbase: {
    realm_hostname: "sterlingrecruitingsolutions.quickbase.com",
    app_id: "bcivf3yss",
    table_id: "bcivf3ysv",
    api_token_secret_ref: "QUICKBASE_STERLING_API_TOKEN",
    default_recruiter_name: "Todd Bryson",
  },
};

// Anderson result-page copy override per spec §B8. The Stage 2 page
// checks these keys and renders alternate copy when present; falls
// through to the generic template otherwise.
const ANDERSON_RESULT_PAGE_COPY_OVERRIDES = {
  recruiter_team_name: "Anderson's recruiting team",
  // The IntelliApp URL pre-codes the source via uri_b query param,
  // so the driver does not need to manually enter a source ID.
  omit_source_id_instruction: true,
  before_you_start_items: [
    "Your full job history for the past 10 years (including non-driving jobs)",
    "2 references",
  ],
  followup_promise: "within 1–2 business days",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const csvPath =
  args.find((a) => !a.startsWith("--")) ?? ANDERSON_CSV_DEFAULT;

interface CsvRow {
  carrier_internal_job_id: string;
  position_title: string;
  description: string;
  job_status: string;
  equipment: string;
  domicile_city: string;
  domicile_state: string;
  domicile_zip: string;
  domicile_lat: string;
  domicile_lng: string;
  hiring_radius_miles: string;
  min_experience_months: string;
  min_otr_experience_months: string;
  accepted_cdl_states: string;
  required_endorsements: string;
  accepted_home_time_types: string;
  pay_range_max_weekly_usd: string;
  accepts_terminated: string;
  accepts_failed_dot_test: string;
  sap_tolerance: string;
  max_tickets_3yr: string;
  max_accidents_3yr: string;
  max_at_fault_accidents_3yr: string;
  accepts_dui: string;
  dui_max_recency_months: string;
  accepts_felony: string;
  preferred_equipment_experience: string;
  preferred_regions: string;
  application_surface: string;
  application_url: string;
  application_email: string;
  application_phone: string;
  display_pay_range_min_weekly_usd: string;
  display_pay_range_max_weekly_usd: string;
  display_signing_bonus_usd: string;
  display_home_time_description: string;
  display_lane_description: string;
  display_benefits_summary: string;
  data_source: string;
  source_url: string;
  last_verified_at: string;
  data_quality: string;
  notes: string;
}

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t === "" ? null : t;
}

function parsePipeArray(s: string): string[] {
  const t = s.trim();
  if (!t) return [];
  return t.split("|").map((p) => p.trim()).filter(Boolean);
}

function parseBool(s: string): boolean {
  return s.trim().toLowerCase() === "true";
}

function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// CSV column "accepted_home_time_types" uses spec-internal values
// ("weekends", "otr") that don't exactly match our home_time enum
// (`daily | weekly | biweekly | otr`). Map at import time:
//   weekends → weekly (the 34-hour reset is a home-weekly pattern)
//   otr      → otr
//   daily/weekly/biweekly pass through
function mapHomeTimeArray(
  raw: string,
): Array<"daily" | "weekly" | "biweekly" | "otr"> {
  const out: Array<"daily" | "weekly" | "biweekly" | "otr"> = [];
  for (const token of parsePipeArray(raw)) {
    switch (token.toLowerCase()) {
      case "daily":
        out.push("daily");
        break;
      case "weekly":
      case "weekends":
        out.push("weekly");
        break;
      case "biweekly":
        out.push("biweekly");
        break;
      case "otr":
        out.push("otr");
        break;
      default:
        console.warn(`  ⚠ unknown home_time value: ${token}`);
    }
  }
  return out;
}

interface PreparedJob {
  externalSourceId: string;
  csvRow: CsvRow;
}

function loadCsv(): PreparedJob[] {
  const raw = readFileSync(csvPath, "utf-8");
  const rows = parse(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];
  return rows.map((r) => ({
    externalSourceId: `anderson:csv:${r.carrier_internal_job_id}`,
    csvRow: r,
  }));
}

async function main() {
  const jobs = loadCsv();
  console.log(`\nAnderson import — ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`CSV: ${csvPath}`);
  console.log(`Rows: ${jobs.length}\n`);
  for (const j of jobs) {
    const r = j.csvRow;
    console.log(
      `  ${j.externalSourceId.padEnd(28)} ${r.position_title.padEnd(45)} ${r.equipment.padEnd(10)} radius=${r.hiring_radius_miles}mi`,
    );
  }

  if (!apply) {
    console.log("\nDRY-RUN — no DB writes. Re-run with --apply to insert.");
    return;
  }

  console.log("\nCommitting to database…");
  const { writeAll } = await import("./_import-anderson-writer");
  await writeAll(jobs.map((j) => ({
    externalSourceId: j.externalSourceId,
    csv: j.csvRow,
    homeTimeMapped: mapHomeTimeArray(j.csvRow.accepted_home_time_types),
    equipmentPrefArr: parsePipeArray(j.csvRow.preferred_equipment_experience),
    regionPrefArr: parsePipeArray(j.csvRow.preferred_regions),
    acceptedCdlStatesArr: parsePipeArray(j.csvRow.accepted_cdl_states),
    requiredEndorsementsArr: parsePipeArray(j.csvRow.required_endorsements),
    payMaxWeekly: parseIntOrNull(j.csvRow.pay_range_max_weekly_usd),
    displayPayMin: parseIntOrNull(j.csvRow.display_pay_range_min_weekly_usd),
    displayPayMax: parseIntOrNull(j.csvRow.display_pay_range_max_weekly_usd),
    displaySigningBonus: parseIntOrNull(j.csvRow.display_signing_bonus_usd),
    hiringRadiusMiles: parseIntOrNull(j.csvRow.hiring_radius_miles),
    minExperienceMonths: parseIntOrNull(j.csvRow.min_experience_months) ?? 0,
    minOtrExperienceMonths: parseIntOrNull(j.csvRow.min_otr_experience_months),
    maxTickets3yr: parseIntOrNull(j.csvRow.max_tickets_3yr),
    maxAccidents3yr: parseIntOrNull(j.csvRow.max_accidents_3yr),
    maxAtFault3yr: parseIntOrNull(j.csvRow.max_at_fault_accidents_3yr),
    duiMaxRecencyMonths: parseIntOrNull(j.csvRow.dui_max_recency_months),
    acceptsTerminated: parseBool(j.csvRow.accepts_terminated),
    acceptsFailedDotTest: parseBool(j.csvRow.accepts_failed_dot_test),
    acceptsDui: parseBool(j.csvRow.accepts_dui),
    acceptsFelony: parseBool(j.csvRow.accepts_felony),
    sapTolerance: j.csvRow.sap_tolerance as
      | "accepts_none"
      | "accepts_completed_only"
      | "accepts_all",
    lastVerifiedAtIso: emptyToNull(j.csvRow.last_verified_at),
  })), {
    carrier: ANDERSON_CARRIER,
    partnerHandoffConfig: ANDERSON_PARTNER_HANDOFF_CONFIG,
    resultPageCopyOverrides: ANDERSON_RESULT_PAGE_COPY_OVERRIDES,
  });
  console.log("Done.");
}

main().catch((err) => {
  console.error("[import-anderson] failed:", err);
  process.exit(1);
});
