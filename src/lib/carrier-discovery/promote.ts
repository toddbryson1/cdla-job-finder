// Promote a pending_carrier row + its pending_carrier_jobs into the
// live `carriers` + `carrier_jobs` tables. Per
// SPEC_prospect-carrier-job-ingestion-v1.md §9 Phase 1:
//   - New carrier rows go in with kind='prospect', tier='none'
//   - carrier_jobs use conservative defaults for everything we can't
//     extract (terminated/SAP/DUI/felony all false; sap_tolerance =
//     accepts_none; min_experience_months = 0)
//   - data_source = 'llm_extract_from_posting' (the enum value
//     covers crawler-derived rows too — see schema notes)
//   - data_quality assigned per §4.7.1:
//       complete = title + city/state + lat/lng + pay range + equipment
//       partial  = title + city/state + lat/lng + (pay OR equipment)
//       minimal  = title only (skipped — see §4.3 step 4)
//
// Idempotent on (carrier_id, external_source_id) so re-promoting
// after a re-discovery upserts rather than duplicates.

import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import {
  carrierJobs,
  carriers,
  pendingCarrierJobs,
  pendingCarriers,
  zipCodes,
} from "@/db/schema";

const CONSERVATIVE_DEFAULT_RADIUS_MI = 200;
const REGIONAL_DEFAULT_RADIUS_MI = 150;
const LOCAL_DEFAULT_RADIUS_MI = 75;

export interface PromoteResult {
  carrierId: string;
  carrierName: string;
  isNewCarrier: boolean;
  jobsInserted: number;
  jobsUpdated: number;
  jobsSkipped: number;
  skipReasons: string[];
}

export interface PromoteOptions {
  /** Email of the human who approved. Recorded on the pending row. */
  reviewerEmail: string;
  /** Test seam — date for reviewed_at / created_at. */
  now?: Date;
}

export async function promotePendingCarrier(
  pendingCarrierId: string,
  options: PromoteOptions,
  database: typeof defaultDb = defaultDb,
): Promise<PromoteResult> {
  const now = options.now ?? new Date();

  const pending = await database
    .select()
    .from(pendingCarriers)
    .where(eq(pendingCarriers.id, pendingCarrierId))
    .limit(1);

  if (pending.length === 0) {
    throw new Error(`pending_carrier ${pendingCarrierId} not found`);
  }
  const p = pending[0];

  // Find or create the live carrier row, idempotent on name.
  let carrierId: string;
  let isNewCarrier = false;

  if (p.promotedCarrierId) {
    carrierId = p.promotedCarrierId;
  } else {
    const existing = await database
      .select({ id: carriers.id })
      .from(carriers)
      .where(sql`LOWER(${carriers.name}) = LOWER(${p.name})`)
      .limit(1);

    if (existing.length > 0) {
      carrierId = existing[0].id;
    } else {
      const [row] = await database
        .insert(carriers)
        .values({
          name: p.name,
          kind: "prospect",
          tier: "none",
          status: "active",
          publicCareersUrl: p.careersUrl ?? p.homepageUrl,
        })
        .returning({ id: carriers.id });
      carrierId = row.id;
      isNewCarrier = true;
    }
  }

  // Pull all staging jobs for this pending carrier.
  const stagingJobs = await database
    .select()
    .from(pendingCarrierJobs)
    .where(eq(pendingCarrierJobs.pendingCarrierId, pendingCarrierId));

  let jobsInserted = 0;
  let jobsUpdated = 0;
  let jobsSkipped = 0;
  const skipReasons: string[] = [];

  for (const j of stagingJobs) {
    const built = await buildCarrierJobRow(
      j,
      carrierId,
      p.careersUrl,
      database,
    );
    if (built.kind === "skip") {
      jobsSkipped++;
      skipReasons.push(`${j.title}: ${built.reason}`);
      continue;
    }

    const externalSourceId = `${j.source}:${j.sourceId}`;

    const existing = await database
      .select({ id: carrierJobs.id })
      .from(carrierJobs)
      .where(eq(carrierJobs.externalSourceId, externalSourceId))
      .limit(1);

    if (existing.length > 0) {
      await database
        .update(carrierJobs)
        .set({
          ...built.row,
          updatedAt: now,
        })
        .where(eq(carrierJobs.id, existing[0].id));
      jobsUpdated++;
    } else {
      await database.insert(carrierJobs).values({
        ...built.row,
        externalSourceId,
        createdAt: now,
        updatedAt: now,
      });
      jobsInserted++;
    }
  }

  // Mark the pending carrier as approved.
  await database
    .update(pendingCarriers)
    .set({
      status: "approved",
      reviewerEmail: options.reviewerEmail,
      reviewedAt: now,
      promotedCarrierId: carrierId,
    })
    .where(eq(pendingCarriers.id, pendingCarrierId));

  return {
    carrierId,
    carrierName: p.name,
    isNewCarrier,
    jobsInserted,
    jobsUpdated,
    jobsSkipped,
    skipReasons,
  };
}

/**
 * Mark a pending carrier as rejected without creating any live rows.
 */
export async function rejectPendingCarrier(
  pendingCarrierId: string,
  reviewerEmail: string,
  reason: string | undefined,
  database: typeof defaultDb = defaultDb,
): Promise<void> {
  await database
    .update(pendingCarriers)
    .set({
      status: "rejected",
      reviewerEmail,
      reviewedAt: new Date(),
      notes: reason ?? null,
    })
    .where(eq(pendingCarriers.id, pendingCarrierId));
}

type StagingJob = typeof pendingCarrierJobs.$inferSelect;

type BuildResult =
  | { kind: "row"; row: Omit<typeof carrierJobs.$inferInsert, "carrierId"> & { carrierId: string } }
  | { kind: "skip"; reason: string };

async function buildCarrierJobRow(
  j: StagingJob,
  carrierId: string,
  careersUrl: string | null,
  database: typeof defaultDb,
): Promise<BuildResult> {
  // Locate the job. Must have city + state. Lat/lng either come
  // through directly or get geocoded from zip_codes by (city, state).
  if (!j.city || !j.state) {
    return { kind: "skip", reason: "no city/state on staging row" };
  }

  let lat = j.lat == null ? null : Number(j.lat);
  let lng = j.lng == null ? null : Number(j.lng);
  if (lat == null || lng == null) {
    const zip = await database
      .select({ lat: zipCodes.lat, lng: zipCodes.lng })
      .from(zipCodes)
      .where(
        and(
          sql`LOWER(${zipCodes.city}) = LOWER(${j.city})`,
          eq(zipCodes.state, j.state),
        ),
      )
      .limit(1);
    if (zip.length === 0) {
      return { kind: "skip", reason: `no zip_codes match for ${j.city}, ${j.state}` };
    }
    lat = Number(zip[0].lat);
    lng = Number(zip[0].lng);
  }
  if (lat == null || lng == null || Number.isNaN(lat) || Number.isNaN(lng)) {
    return { kind: "skip", reason: "geocoding produced no lat/lng" };
  }

  // Equipment fallback. The crawler guesses; if unknown, default to
  // dry_van (the most common). The matcher requires an equipment
  // value; null isn't allowed.
  const equipment = j.equipmentGuess ?? "dry_van";

  // OTR detection: title + description scan.
  const text = `${j.title} ${j.description ?? ""}`;
  const isOtr = /\bOTR\b|\bover[- ]the[- ]road\b/i.test(text);
  const isRegional = /\bregional\b/i.test(text);
  const isLocal = /\blocal\b|\bhome\s+daily\b/i.test(text);
  const isWeekly = /\bhome\s+weekly\b|\bweekly\s+home\s+time\b/i.test(text);

  let acceptedHomeTimeTypes: ("daily" | "weekly" | "biweekly" | "otr")[];
  let hiringRadiusMiles: number | null;
  if (isOtr) {
    acceptedHomeTimeTypes = ["otr"];
    hiringRadiusMiles = null;
  } else if (isLocal) {
    acceptedHomeTimeTypes = ["daily"];
    hiringRadiusMiles = LOCAL_DEFAULT_RADIUS_MI;
  } else if (isWeekly) {
    acceptedHomeTimeTypes = ["weekly"];
    hiringRadiusMiles = isRegional ? REGIONAL_DEFAULT_RADIUS_MI : CONSERVATIVE_DEFAULT_RADIUS_MI;
  } else if (isRegional) {
    acceptedHomeTimeTypes = ["weekly"];
    hiringRadiusMiles = REGIONAL_DEFAULT_RADIUS_MI;
  } else {
    acceptedHomeTimeTypes = ["weekly"];
    hiringRadiusMiles = CONSERVATIVE_DEFAULT_RADIUS_MI;
  }

  // Data quality tier per §4.7.1.
  const hasPay = j.payMinWeeklyUsd != null || j.payMaxWeeklyUsd != null;
  const hasEq = j.equipmentGuess != null;
  let dataQuality: "complete" | "partial" | "minimal";
  if (hasPay && hasEq) {
    dataQuality = "complete";
  } else if (hasPay || hasEq) {
    dataQuality = "partial";
  } else {
    dataQuality = "minimal";
  }

  // Application surface is what we classified at staging time.
  const surface = (
    [
      "tenstreet_intelliapp",
      "custom_intake_form",
      "email_only",
      "phone_only",
      "unknown",
    ] as const
  ).includes(j.applicationSurface as "unknown")
    ? (j.applicationSurface as
        | "tenstreet_intelliapp"
        | "custom_intake_form"
        | "email_only"
        | "phone_only"
        | "unknown")
    : "unknown";

  return {
    kind: "row",
    row: {
      carrierId,
      status: "active",
      positionTitle: j.title,
      description: j.description ?? null,
      domicileCity: j.city,
      domicileState: j.state,
      domicileLat: String(lat),
      domicileLng: String(lng),
      hiringRadiusMiles,
      equipment,
      minExperienceMonths: 0,
      acceptedCdlStates: [],
      requiredEndorsements: [],
      acceptedHomeTimeTypes,
      payRangeMaxWeeklyUsd: j.payMaxWeeklyUsd ?? null,
      acceptsTerminated: false,
      acceptsFailedDotTest: false,
      sapTolerance: "accepts_none",
      acceptsDui: false,
      acceptsFelony: false,
      preferredEquipmentExperience: [],
      preferredRegions: [],
      applicationSurface: surface,
      applicationUrl: j.applyUrl,
      dataSource: "llm_extract_from_posting",
      sourceUrl: careersUrl ?? j.applyUrl,
      lastVerifiedAt: new Date(),
      verificationStatus: "verified",
      dataQuality,
      displayPayRangeMinWeeklyUsd: j.payMinWeeklyUsd ?? null,
      displayPayRangeMaxWeeklyUsd: j.payMaxWeeklyUsd ?? null,
    },
  };
}
