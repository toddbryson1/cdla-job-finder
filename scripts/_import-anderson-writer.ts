// Anderson DB writer. Lazy-loaded from scripts/import-anderson.ts so
// dotenv has loaded DATABASE_URL before db/client evaluates.

import { eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { carrierJobs, carriers } from "../src/db/schema";

export interface PreparedJob {
  externalSourceId: string;
  csv: {
    position_title: string;
    description: string;
    equipment: string;
    domicile_city: string;
    domicile_state: string;
    domicile_zip: string;
    domicile_lat: string;
    domicile_lng: string;
    application_surface: string;
    application_url: string;
    data_source: string;
    source_url: string;
    data_quality: string;
    display_home_time_description: string;
    display_lane_description: string;
    display_benefits_summary: string;
  };
  homeTimeMapped: Array<"daily" | "weekly" | "biweekly" | "otr">;
  equipmentPrefArr: string[];
  regionPrefArr: string[];
  acceptedCdlStatesArr: string[];
  requiredEndorsementsArr: string[];
  payMaxWeekly: number | null;
  displayPayMin: number | null;
  displayPayMax: number | null;
  displaySigningBonus: number | null;
  hiringRadiusMiles: number | null;
  minExperienceMonths: number;
  minOtrExperienceMonths: number | null;
  maxTickets3yr: number | null;
  maxAccidents3yr: number | null;
  maxAtFault3yr: number | null;
  duiMaxRecencyMonths: number | null;
  acceptsTerminated: boolean;
  acceptsFailedDotTest: boolean;
  acceptsDui: boolean;
  acceptsFelony: boolean;
  sapTolerance:
    | "accepts_none"
    | "accepts_completed_only"
    | "accepts_all";
  lastVerifiedAtIso: string | null;
}

export interface CarrierConfig {
  carrier: {
    name: string;
    legalName: string;
    kind: "partner" | "prospect" | "subscription";
    tier: "tier_1" | "tier_2" | "none";
    status: "active" | "paused" | "archived";
    publicCareersUrl: string;
    tenstreetAccountId: string;
    businessAddressLat: string;
    businessAddressLng: string;
  };
  partnerHandoffConfig: Record<string, unknown>;
  resultPageCopyOverrides: Record<string, unknown>;
}

export async function writeAll(
  jobs: PreparedJob[],
  cfg: CarrierConfig,
): Promise<void> {
  const carrierId = await ensureCarrier(cfg);

  let inserted = 0;
  let updated = 0;
  const seenSourceIds: string[] = [];

  for (const j of jobs) {
    seenSourceIds.push(j.externalSourceId);
    const values = {
      carrierId,
      status: "active" as const,
      positionTitle: j.csv.position_title,
      description: j.csv.description,
      domicileCity: j.csv.domicile_city,
      domicileState: j.csv.domicile_state,
      domicileZip: j.csv.domicile_zip || null,
      domicileLat: j.csv.domicile_lat,
      domicileLng: j.csv.domicile_lng,
      hiringRadiusMiles: j.hiringRadiusMiles,
      equipment: j.csv.equipment,
      minExperienceMonths: j.minExperienceMonths,
      minOtrExperienceMonths: j.minOtrExperienceMonths,
      acceptedCdlStates: j.acceptedCdlStatesArr,
      requiredEndorsements: j.requiredEndorsementsArr,
      acceptedHomeTimeTypes: j.homeTimeMapped,
      payRangeMaxWeeklyUsd: j.payMaxWeekly,
      acceptsTerminated: j.acceptsTerminated,
      acceptsFailedDotTest: j.acceptsFailedDotTest,
      sapTolerance: j.sapTolerance,
      maxTickets3yr: j.maxTickets3yr,
      maxAccidents3yr: j.maxAccidents3yr,
      maxAtFaultAccidents3yr: j.maxAtFault3yr,
      acceptsDui: j.acceptsDui,
      duiMaxRecencyMonths: j.duiMaxRecencyMonths,
      acceptsFelony: j.acceptsFelony,
      preferredEquipmentExperience: j.equipmentPrefArr,
      preferredRegions: j.regionPrefArr,
      applicationSurface: j.csv.application_surface as
        | "tenstreet_intelliapp"
        | "custom_intake_form"
        | "email_only"
        | "phone_only"
        | "unknown",
      applicationUrl: j.csv.application_url,
      lastApplicationSurfaceVerifiedAt: new Date(),
      // CSV uses spec-shorthand "partner_intake"; map to the enum
      // value "manual_partner_intake" defined in the schema.
      dataSource: (j.csv.data_source === "partner_intake"
        ? "manual_partner_intake"
        : j.csv.data_source) as
        | "manual_partner_intake"
        | "manual_subscription_onboarding"
        | "fmcsa_census_scrape"
        | "tenstreet_feed"
        | "carrier_self_service"
        | "llm_extract_from_posting",
      sourceUrl: j.csv.source_url || null,
      lastVerifiedAt: j.lastVerifiedAtIso
        ? new Date(j.lastVerifiedAtIso)
        : new Date(),
      verificationStatus: "verified" as const,
      dataQuality: j.csv.data_quality as "complete" | "partial" | "minimal",
      externalSourceId: j.externalSourceId,
      displayPayRangeMinWeeklyUsd: j.displayPayMin,
      displayPayRangeMaxWeeklyUsd: j.displayPayMax,
      displaySigningBonusUsd: j.displaySigningBonus,
      displayHomeTimeDescription: j.csv.display_home_time_description || null,
      displayLaneDescription: j.csv.display_lane_description || null,
      displayBenefitsSummary: j.csv.display_benefits_summary || null,
    };

    const existing = await db
      .select({ id: carrierJobs.id })
      .from(carrierJobs)
      .where(eq(carrierJobs.externalSourceId, j.externalSourceId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(carrierJobs)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(carrierJobs.id, existing[0].id));
      updated++;
    } else {
      await db.insert(carrierJobs).values(values);
      inserted++;
    }
  }

  // Archive any anderson:csv:* row that wasn't in the current CSV.
  // Matches the Swift/CRE sync convention — a job that's gone is
  // marked status='archived' rather than deleted (preserves history
  // + downstream match references).
  let archived = 0;
  if (seenSourceIds.length > 0) {
    const all = await db
      .select({ id: carrierJobs.id, xid: carrierJobs.externalSourceId })
      .from(carrierJobs)
      .where(like(carrierJobs.externalSourceId, "anderson:csv:%"));
    const stale = all.filter((r) => !seenSourceIds.includes(r.xid!));
    if (stale.length > 0) {
      await db
        .update(carrierJobs)
        .set({ status: "archived", updatedAt: new Date() })
        .where(
          inArray(
            carrierJobs.id,
            stale.map((r) => r.id),
          ),
        );
      archived = stale.length;
    }
  }

  console.log(
    `\nWrote ${inserted} new + ${updated} updated; ${archived} archived (rows in DB no longer in CSV)`,
  );
}

async function ensureCarrier(cfg: CarrierConfig): Promise<string> {
  const existing = await db
    .select({ id: carriers.id })
    .from(carriers)
    .where(eq(carriers.name, cfg.carrier.name))
    .limit(1);

  if (existing.length > 0) {
    // Keep existing kind/status; refresh the metadata + handoff config.
    await db
      .update(carriers)
      .set({
        legalName: cfg.carrier.legalName,
        publicCareersUrl: cfg.carrier.publicCareersUrl,
        tenstreetAccountId: cfg.carrier.tenstreetAccountId,
        businessAddressLat: cfg.carrier.businessAddressLat,
        businessAddressLng: cfg.carrier.businessAddressLng,
        partnerHandoffConfig: cfg.partnerHandoffConfig,
        resultPageCopyOverrides: cfg.resultPageCopyOverrides,
      })
      .where(eq(carriers.id, existing[0].id));
    console.log(
      `  refreshed carriers.${cfg.carrier.name} (id=${existing[0].id})`,
    );
    return existing[0].id;
  }

  const [row] = await db
    .insert(carriers)
    .values({
      name: cfg.carrier.name,
      legalName: cfg.carrier.legalName,
      kind: cfg.carrier.kind,
      tier: cfg.carrier.tier,
      status: cfg.carrier.status,
      publicCareersUrl: cfg.carrier.publicCareersUrl,
      tenstreetAccountId: cfg.carrier.tenstreetAccountId,
      businessAddressLat: cfg.carrier.businessAddressLat,
      businessAddressLng: cfg.carrier.businessAddressLng,
      partnerHandoffConfig: cfg.partnerHandoffConfig,
      resultPageCopyOverrides: cfg.resultPageCopyOverrides,
    })
    .returning({ id: carriers.id });
  if (!row) throw new Error("Failed to insert carriers row");
  console.log(`  created carriers.${cfg.carrier.name} (id=${row.id})`);
  return row.id;
}
