// CR England carrier + jobs importer.
//
// Reads /Users/toddbryson/Downloads/cr-england.csv (or path passed as
// argv[2]) — 185 rows × 41 distinct Tenstreet jobs spread across 33
// states — and upserts them into carrier_jobs, then ensures the
// "C.R. England" carriers row exists with the metadata derived from
// the hiring-guidelines docx.
//
// Idempotent. The external_source_id format is
//   cre:csv:<internal_job_id>:<state>:<zip>
// so re-running the script updates existing rows in place instead of
// inserting duplicates. After upsert it archives any cre:csv:* row
// not seen in the current CSV (matches Swift sync semantics — a job
// that's gone from the source is marked status='archived').
//
// Stage 2 hiring criteria come straight from the docx:
//   - max 3 moving violations in 3 years
//   - max 3 preventable accidents in 3 years
//   - no DUI in past 5 years (60 months), max 2 lifetime
//   - felony tolerance: Cat C+D allowed conditionally, Cat A+B
//     time-limited (model as acceptsFelony=true since the schema's
//     boolean undermodels the category nuance — the carrier's
//     application catches the rest)
//   - terminated from last 2 CDL jobs = ineligible (the CSV says
//     accepts_terminated=false so the schema-level flag matches)
//
// Usage:
//   npx tsx scripts/import-cre.ts                    # dry run, print summary
//   npx tsx scripts/import-cre.ts --apply            # write to DB
//   npx tsx scripts/import-cre.ts /path/csv --apply  # custom CSV path

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

import { parse } from "csv-parse/sync";
import { readFileSync } from "node:fs";
import {
  and,
  eq,
  isNotNull,
  like,
  notInArray,
  sql,
} from "drizzle-orm";

const DEFAULT_CSV_PATH = "/Users/toddbryson/Downloads/cr-england.csv";
const CARRIER_NAME = "C.R. England";
const CARRIER_LEGAL_NAME = "C.R. England, Inc.";
const CARRIER_CAREERS_URL = "https://crengland.com/careers";
const CRE_HIRING_GUIDE_REVIEWED = "2026-05-27"; // when we last reviewed the docx

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

function pipeArray(s: string): string[] {
  return s
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
}

function nullableInt(s: string): number | null {
  if (!s || s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function nullableStr(s: string): string | null {
  return s && s.trim() !== "" ? s.trim() : null;
}

function parseBool(s: string): boolean {
  return s.toLowerCase() === "true";
}

type HomeTime = "daily" | "weekly" | "biweekly" | "otr";
type SapTolerance = "accepts_none" | "accepts_completed_only" | "accepts_all";
type ApplicationSurface =
  | "tenstreet_intelliapp"
  | "custom_intake_form"
  | "email_only"
  | "phone_only"
  | "unknown";
type DataSource =
  | "manual_partner_intake"
  | "manual_subscription_onboarding"
  | "fmcsa_census_scrape"
  | "tenstreet_feed"
  | "carrier_self_service"
  | "llm_extract_from_posting";
type DataQuality = "complete" | "partial" | "minimal";

interface MappedJob {
  externalSourceId: string;
  positionTitle: string;
  description: string;
  equipment: string;
  domicileCity: string;
  domicileState: string;
  domicileZip: string | null;
  domicileLat: string;
  domicileLng: string;
  hiringRadiusMiles: number | null;
  minExperienceMonths: number;
  minOtrExperienceMonths: number | null;
  acceptedCdlStates: string[];
  requiredEndorsements: string[];
  acceptedHomeTimeTypes: HomeTime[];
  payRangeMaxWeeklyUsd: number | null;
  acceptsTerminated: boolean;
  acceptsFailedDotTest: boolean;
  sapTolerance: SapTolerance;
  maxTickets3yr: number | null;
  maxAccidents3yr: number | null;
  maxAtFaultAccidents3yr: number | null;
  acceptsDui: boolean;
  duiMaxRecencyMonths: number | null;
  acceptsFelony: boolean;
  preferredEquipmentExperience: string[];
  preferredRegions: string[];
  applicationSurface: ApplicationSurface;
  applicationUrl: string | null;
  applicationEmail: string | null;
  applicationPhone: string | null;
  displayPayRangeMinWeeklyUsd: number | null;
  displayPayRangeMaxWeeklyUsd: number | null;
  displaySigningBonusUsd: number | null;
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
  dataSource: DataSource;
  sourceUrl: string | null;
  lastVerifiedAt: Date | null;
  dataQuality: DataQuality;
  notes: string;
}

function mapRow(r: CsvRow): MappedJob {
  const homeTimes = pipeArray(r.accepted_home_time_types) as HomeTime[];
  return {
    externalSourceId: `cre:csv:${r.carrier_internal_job_id}:${r.domicile_state}:${r.domicile_zip}`,
    positionTitle: r.position_title,
    description: r.description,
    equipment: r.equipment,
    domicileCity: r.domicile_city,
    domicileState: r.domicile_state,
    domicileZip: nullableStr(r.domicile_zip),
    domicileLat: r.domicile_lat,
    domicileLng: r.domicile_lng,
    hiringRadiusMiles: nullableInt(r.hiring_radius_miles),
    minExperienceMonths: nullableInt(r.min_experience_months) ?? 0,
    minOtrExperienceMonths: nullableInt(r.min_otr_experience_months),
    acceptedCdlStates: pipeArray(r.accepted_cdl_states),
    requiredEndorsements: pipeArray(r.required_endorsements),
    acceptedHomeTimeTypes: homeTimes,
    payRangeMaxWeeklyUsd: nullableInt(r.pay_range_max_weekly_usd),
    acceptsTerminated: parseBool(r.accepts_terminated),
    acceptsFailedDotTest: parseBool(r.accepts_failed_dot_test),
    sapTolerance: (r.sap_tolerance || "accepts_none") as SapTolerance,
    maxTickets3yr: nullableInt(r.max_tickets_3yr),
    maxAccidents3yr: nullableInt(r.max_accidents_3yr),
    maxAtFaultAccidents3yr: nullableInt(r.max_at_fault_accidents_3yr),
    acceptsDui: parseBool(r.accepts_dui),
    duiMaxRecencyMonths: nullableInt(r.dui_max_recency_months),
    acceptsFelony: parseBool(r.accepts_felony),
    preferredEquipmentExperience: pipeArray(r.preferred_equipment_experience),
    preferredRegions: pipeArray(r.preferred_regions),
    applicationSurface: (r.application_surface ||
      "unknown") as ApplicationSurface,
    applicationUrl: nullableStr(r.application_url),
    applicationEmail: nullableStr(r.application_email),
    applicationPhone: nullableStr(r.application_phone),
    displayPayRangeMinWeeklyUsd: nullableInt(
      r.display_pay_range_min_weekly_usd,
    ),
    displayPayRangeMaxWeeklyUsd: nullableInt(
      r.display_pay_range_max_weekly_usd,
    ),
    displaySigningBonusUsd: nullableInt(r.display_signing_bonus_usd),
    displayHomeTimeDescription: nullableStr(r.display_home_time_description),
    displayLaneDescription: nullableStr(r.display_lane_description),
    displayBenefitsSummary: nullableStr(r.display_benefits_summary),
    dataSource: (r.data_source || "manual_partner_intake") as DataSource,
    sourceUrl: nullableStr(r.source_url),
    lastVerifiedAt: r.last_verified_at ? new Date(r.last_verified_at) : null,
    dataQuality: (r.data_quality || "partial") as DataQuality,
    notes: r.notes,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const csvPath = args.find((a) => !a.startsWith("--")) ?? DEFAULT_CSV_PATH;

  console.log(`CR England import — ${apply ? "APPLY" : "DRY RUN"}`);
  console.log(`  CSV: ${csvPath}`);

  const text = readFileSync(csvPath, "utf-8");
  const rows = parse(text, { columns: true, skip_empty_lines: true }) as CsvRow[];
  const mapped = rows.map(mapRow);

  // Sanity: every row should be active. Any inactive rows would be
  // archived by status='archived' instead of inserted.
  const active = mapped.filter((_, i) => rows[i].job_status === "active");
  const inactive = mapped.length - active.length;
  console.log(
    `  rows parsed: ${rows.length} (${active.length} active, ${inactive} non-active)`,
  );
  console.log(
    `  distinct internal jobs: ${new Set(rows.map((r) => r.carrier_internal_job_id)).size}`,
  );
  console.log(
    `  distinct domicile states: ${new Set(rows.map((r) => r.domicile_state)).size}`,
  );
  console.log(
    `  pay range max-weekly: $${Math.min(
      ...active.map((m) => m.payRangeMaxWeeklyUsd ?? Infinity),
    )} - $${Math.max(
      ...active.map((m) => m.payRangeMaxWeeklyUsd ?? -Infinity),
    )}`,
  );

  // OTR invariant pre-check (matches the new CHECK constraint).
  const violations = active.filter(
    (m) =>
      m.hiringRadiusMiles == null && !m.acceptedHomeTimeTypes.includes("otr"),
  );
  if (violations.length > 0) {
    console.error(
      `  ✗ ${violations.length} OTR invariant violations — would be rejected by Postgres CHECK`,
    );
    for (const v of violations.slice(0, 3)) {
      console.error(
        `    ${v.externalSourceId} home_time=${JSON.stringify(v.acceptedHomeTimeTypes)}`,
      );
    }
    process.exit(1);
  }
  console.log("  ✓ no OTR invariant violations");

  if (!apply) {
    console.log("\nDry run complete. Pass --apply to write to the DB.");
    process.exit(0);
  }

  // Real work — import DB modules now that env is loaded.
  const { db } = await import("../src/db/client");
  const { carriers, carrierJobs } = await import("../src/db/schema");

  // 1. Ensure carrier row exists.
  let carrier = await db.query.carriers.findFirst({
    where: eq(carriers.name, CARRIER_NAME),
  });
  if (!carrier) {
    const [row] = await db
      .insert(carriers)
      .values({
        name: CARRIER_NAME,
        legalName: CARRIER_LEGAL_NAME,
        kind: "partner",
        tier: "tier_2",
        status: "active",
        publicCareersUrl: CARRIER_CAREERS_URL,
      })
      .returning();
    carrier = row;
    console.log(`  carrier inserted: ${carrier.id}`);
  } else {
    console.log(`  carrier already exists: ${carrier.id}`);
  }

  // 2. Upsert all jobs.
  let inserted = 0;
  let updated = 0;
  const keepIds: string[] = [];
  for (const job of active) {
    keepIds.push(job.externalSourceId);
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
      minOtrExperienceMonths: job.minOtrExperienceMonths ?? undefined,
      acceptedCdlStates: job.acceptedCdlStates,
      requiredEndorsements: job.requiredEndorsements,
      acceptedHomeTimeTypes: job.acceptedHomeTimeTypes,
      payRangeMaxWeeklyUsd: job.payRangeMaxWeeklyUsd ?? undefined,
      acceptsTerminated: job.acceptsTerminated,
      acceptsFailedDotTest: job.acceptsFailedDotTest,
      sapTolerance: job.sapTolerance,
      maxTickets3yr: job.maxTickets3yr ?? undefined,
      maxAccidents3yr: job.maxAccidents3yr ?? undefined,
      maxAtFaultAccidents3yr: job.maxAtFaultAccidents3yr ?? undefined,
      acceptsDui: job.acceptsDui,
      duiMaxRecencyMonths: job.duiMaxRecencyMonths ?? undefined,
      acceptsFelony: job.acceptsFelony,
      preferredEquipmentExperience: job.preferredEquipmentExperience,
      preferredRegions: job.preferredRegions,
      applicationSurface: job.applicationSurface,
      applicationUrl: job.applicationUrl ?? undefined,
      applicationEmail: job.applicationEmail ?? undefined,
      applicationPhone: job.applicationPhone ?? undefined,
      displayPayRangeMinWeeklyUsd:
        job.displayPayRangeMinWeeklyUsd ?? undefined,
      displayPayRangeMaxWeeklyUsd:
        job.displayPayRangeMaxWeeklyUsd ?? undefined,
      displaySigningBonusUsd: job.displaySigningBonusUsd ?? undefined,
      displayHomeTimeDescription: job.displayHomeTimeDescription ?? undefined,
      displayLaneDescription: job.displayLaneDescription ?? undefined,
      displayBenefitsSummary: job.displayBenefitsSummary ?? undefined,
      dataSource: job.dataSource,
      sourceUrl: job.sourceUrl ?? undefined,
      verificationStatus: "verified" as const,
      dataQuality: job.dataQuality,
      lastVerifiedAt: job.lastVerifiedAt ?? new Date(),
    };
    if (existing) {
      await db
        .update(carrierJobs)
        .set({ ...common, updatedAt: new Date() })
        .where(eq(carrierJobs.id, existing.id));
      updated += 1;
    } else {
      await db.insert(carrierJobs).values({
        carrierId: carrier.id,
        externalSourceId: job.externalSourceId,
        ...common,
      });
      inserted += 1;
    }
  }

  // 3. Archive any cre:csv:* row not in the current CSV. Matches Swift's
  // semantics — a job that disappeared from the source feed is marked
  // archived so it stops appearing to drivers.
  const archived = await db
    .update(carrierJobs)
    .set({ status: "archived", updatedAt: new Date() })
    .where(
      and(
        eq(carrierJobs.carrierId, carrier.id),
        eq(carrierJobs.status, "active"),
        isNotNull(carrierJobs.externalSourceId),
        like(carrierJobs.externalSourceId, "cre:csv:%"),
        notInArray(carrierJobs.externalSourceId, keepIds),
      ),
    )
    .returning({ id: carrierJobs.id });

  console.log("\nSummary:");
  console.log(`  inserted: ${inserted}`);
  console.log(`  updated:  ${updated}`);
  console.log(`  archived: ${archived.length}`);
  console.log(`  hiring guide reviewed: ${CRE_HIRING_GUIDE_REVIEWED}`);

  // Stable warning so we don't forget the schema undermodels CRE's full rules.
  console.log(
    "\nNOTE: schema currently undermodels these CR England rules — Stage 2 questions + Tenstreet ATS catch them:",
  );
  console.log("  - failed CDL-position drug screen = lifetime DQ");
  console.log("  - lifetime cap of 2 DUIs total");
  console.log("  - no DUI ever in a CMV");
  console.log("  - reckless driving = 5-year ban");
  console.log("  - license suspension w/in 12mo = ban");
  console.log("  - under-23 drivers: stricter ticket caps");
  console.log("  - US citizenship / work auth required");
  console.log("  - major preventable accident w/fatality = permanent ban");
  console.log(
    "  - terminated from last 2 CDL jobs (our schema has 'last 3' boolean)",
  );

  process.exit(0);
}

main().catch((e) => {
  console.error("CR England import failed:", e);
  process.exit(1);
});
