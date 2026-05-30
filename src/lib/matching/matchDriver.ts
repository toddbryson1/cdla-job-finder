import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { driverCarrierMatches, drivers } from "@/db/schema";
import type { DriverProfile } from "./hardFilter";
import { runHardFilter } from "./hardFilter";
import { rankCandidates } from "./softRank";
import { applyTier1Exclusivity } from "./exclusivity";
import { matchLabel } from "./label";
import { defaultGetFirstMatchTime } from "./getFirstMatchTime";
import type { Match, MatchOptions, MatchResult } from "./types";

const DEFAULT_LIMIT = 20;

class MatchEngineError extends Error {}

export async function matchDriver(
  driverId: string,
  options: MatchOptions = {},
  database: typeof defaultDb = defaultDb,
): Promise<MatchResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? DEFAULT_LIMIT;
  const getFirstMatchTime = options.getFirstMatchTime ?? defaultGetFirstMatchTime;

  const driverRow = await database.query.drivers.findFirst({
    where: eq(drivers.id, driverId),
  });

  if (!driverRow) {
    throw new MatchEngineError(`Driver ${driverId} not found`);
  }
  if (driverRow.homeLat == null || driverRow.homeLng == null) {
    throw new MatchEngineError(
      `Driver ${driverId} has no home_lat/home_lng — geocode from home_zip before matching`,
    );
  }

  const driverProfile: DriverProfile & {
    equipmentRun: string[];
    desiredRegions: string[];
  } = {
    id: driverRow.id,
    homeLat: Number(driverRow.homeLat),
    homeLng: Number(driverRow.homeLng),
    willingToRelocate: driverRow.willingToRelocate,
    desiredEquipment: driverRow.desiredEquipment,
    equipmentRun: driverRow.equipmentRun,
    desiredRegions: driverRow.desiredRegions,
    experienceMonths: Math.round(Number(driverRow.yearsHeld) * 12),
    otrExperienceMonths: Math.round(Number(driverRow.otrYears) * 12),
    totalCareerExperienceMonths: driverRow.totalCareerExperienceMonths,
    monthsSinceLastDrove: driverRow.monthsSinceLastDrove,
    cdlState: driverRow.cdlState,
    endorsements: driverRow.endorsements,
    homeTime: driverRow.homeTime as string[],
    minWeeklyPay: driverRow.minWeeklyPay,
    terminated: driverRow.terminatedFromAnyOfLast3Employers,
    failedDot: driverRow.failedDotTest,
    sapStatus: driverRow.sapStatus,
  };

  const candidates = await runHardFilter(driverProfile, database);

  const { rows: afterExclusivity, windowEndsAt } = await applyTier1Exclusivity(
    driverId,
    candidates,
    getFirstMatchTime,
    now,
  );

  const ranked = rankCandidates(afterExclusivity, driverProfile);

  const truncated = ranked.length > limit;
  const top = ranked.slice(0, limit);

  const matches: Match[] = top.map(({ row, score }) => {
    const payRangeMax =
      row.display_pay_range_max_weekly_usd ?? row.pay_range_max_weekly_usd ?? null;
    const payRangeMin = row.display_pay_range_min_weekly_usd ?? null;
    const payWarning =
      driverProfile.minWeeklyPay > 0 && row.pay_range_max_weekly_usd == null
        ? ("pay_not_disclosed" as const)
        : null;

    return {
      jobId: row.job_id,
      carrierId: row.carrier_id,
      carrierName: row.carrier_name,
      carrierKind: row.carrier_kind,
      carrierTier: row.carrier_tier,
      label: matchLabel(row.carrier_kind, row.carrier_tier),
      positionTitle: row.position_title,
      equipment: row.equipment,
      domicileCity: row.domicile_city,
      domicileState: row.domicile_state,
      distanceMilesFromDriverHome:
        row.distance_miles == null ? null : Math.round(row.distance_miles * 10) / 10,
      payRangeMinWeekly: payRangeMin,
      payRangeMaxWeekly: payRangeMax,
      payWarning,
      applicationSurface: row.application_surface,
      applicationUrl: row.application_url,
      applicationPhone: row.application_phone,
      softRankScore: score,
      exclusivityWindowEndsAt: windowEndsAt.get(row.job_id) ?? null,
      verificationStatus: row.verification_status,
      dataQuality: row.data_quality,
    };
  });

  // Persist match impressions. ON CONFLICT DO NOTHING preserves the
  // original matched_at so getFirstMatchTime keeps returning the true
  // first-seen time per (driver, carrier). Best-effort: a tracking write
  // failure shouldn't break the matches page render.
  if (matches.length > 0) {
    try {
      await database
        .insert(driverCarrierMatches)
        .values(
          matches.map((m) => ({
            driverId,
            jobId: m.jobId,
            carrierId: m.carrierId,
            matchedAt: now,
            softRankScore: String(m.softRankScore),
            distanceMilesFromDriverHome:
              m.distanceMilesFromDriverHome == null
                ? null
                : String(m.distanceMilesFromDriverHome),
          })),
        )
        .onConflictDoNothing({
          target: [driverCarrierMatches.driverId, driverCarrierMatches.jobId],
        });
    } catch (err) {
      console.error("[matchDriver] match tracking write failed:", err);
    }
  }

  return {
    driverId,
    matchedAt: now,
    matches,
    truncated,
  };
}
