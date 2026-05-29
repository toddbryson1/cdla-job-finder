// External-jobs orchestrator. Given a driver profile and a count we
// need to fill, return up to N external listings sorted by distance
// from the driver's home.
//
// Caching strategy: cache hits when a row in `external_jobs` for the
// same (source, source_id) was fetched within CACHE_TTL_HOURS. We
// query the DB first by lat/lng bounding box; if we have enough fresh
// rows in the area, we return those and skip the API call. Otherwise
// we call Adzuna, upsert each result, and re-query.
//
// We always re-query after upsert so the rows we return have stable
// `external_jobs.id`s for impression tracking.

import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { externalJobs } from "@/db/schema";
import { isAdzunaConfigured, searchAdzuna } from "./adzuna";
import type {
  DriverGeoProfile,
  ExternalJobListing,
  ExternalMatch,
} from "./types";

const CACHE_TTL_HOURS = 24;

// Default radius when driver isn't willing to relocate. Matches the
// typical carrier hiring radius — feels natural to a driver looking
// for jobs "near me".
const DEFAULT_RADIUS_MILES = 100;

// When willing to relocate, we drop the geo filter entirely (radius
// large enough to cover the lower 48).
const RELOCATE_RADIUS_MILES = 3000;

export interface TopUpInput {
  driver: DriverGeoProfile;
  /** Count we need to reach (e.g. 5). */
  targetCount: number;
  /** Internal matches already secured — used to compute deficit. */
  internalCount: number;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

/**
 * Top up the driver's matches to `targetCount` with external listings.
 * Returns at most (targetCount - internalCount) results. Empty array
 * when no top-up is needed, Adzuna isn't configured, or the API
 * returned nothing CDL-relevant.
 */
export async function topUpWithExternal(
  input: TopUpInput,
  database: typeof defaultDb = defaultDb,
): Promise<ExternalMatch[]> {
  const deficit = input.targetCount - input.internalCount;
  if (deficit <= 0) return [];
  if (!isAdzunaConfigured()) return [];

  const radius = input.driver.willingToRelocate
    ? RELOCATE_RADIUS_MILES
    : DEFAULT_RADIUS_MILES;

  // 1. Try cache first. Fresh rows in the driver's lat/lng box that
  //    match (loosely) on equipment.
  const cached = await queryCache(
    database,
    input.driver,
    radius,
    deficit,
  );
  if (cached.length >= deficit) {
    return cached;
  }

  // 2. Hit Adzuna for fresh data.
  const listings = await searchAdzuna({
    lat: input.driver.homeLat,
    lng: input.driver.homeLng,
    radiusMiles: radius,
    desiredEquipment: input.driver.desiredEquipment,
    minWeeklyPayUsd: input.driver.minWeeklyPay,
    limit: 50,
    fetchImpl: input.fetchImpl,
  });

  if (listings.length === 0) {
    // Adzuna returned nothing useful. Fall back to whatever cache had.
    return cached;
  }

  await upsertListings(database, listings);

  // 3. Re-query so we get stable ids for impression tracking.
  return queryCache(database, input.driver, radius, deficit);
}

/**
 * Read fresh external_jobs rows near the driver. Returns at most
 * `limit` rows sorted by haversine distance from driver home.
 */
async function queryCache(
  database: typeof defaultDb,
  driver: DriverGeoProfile,
  radiusMiles: number,
  limit: number,
): Promise<ExternalMatch[]> {
  const equipmentArr = driver.desiredEquipment;
  const equipmentLiteral = `{${equipmentArr.map((e) => `"${e.replace(/"/g, '\\"')}"`).join(",")}}`;

  const rawResult = await database.execute(sql`
    SELECT
      id,
      title,
      company_name,
      city,
      state,
      lat,
      lng,
      equipment_guess,
      salary_min_annual_usd,
      salary_max_annual_usd,
      salary_is_predicted,
      redirect_url,
      source,
      posted_at,
      CASE
        WHEN lat IS NULL OR lng IS NULL THEN NULL
        ELSE 3959 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${driver.homeLat}::numeric)) * cos(radians(lat)) *
            cos(radians(lng) - radians(${driver.homeLng}::numeric)) +
            sin(radians(${driver.homeLat}::numeric)) * sin(radians(lat))
          ))
        )
      END AS distance_miles
    FROM external_jobs
    WHERE fetched_at >= NOW() - INTERVAL '${sql.raw(String(CACHE_TTL_HOURS))} hours'
      -- Loose equipment match: either no guess (keep it — might still
      -- be relevant) or guess overlaps with driver's desired equipment.
      AND (
        equipment_guess IS NULL
        OR equipment_guess = ANY(${equipmentLiteral}::text[])
      )
      -- Geo: must be within bounding box around driver home. The
      -- 0.06 degree fudge handles the lat-precision near radius edges.
      AND (
        lat IS NULL
        OR (
          lat BETWEEN ${driver.homeLat}::numeric - (${radiusMiles}::numeric / 69 + 0.06)
                  AND ${driver.homeLat}::numeric + (${radiusMiles}::numeric / 69 + 0.06)
          AND lng BETWEEN ${driver.homeLng}::numeric - (${radiusMiles}::numeric / 50 + 0.06)
                      AND ${driver.homeLng}::numeric + (${radiusMiles}::numeric / 50 + 0.06)
        )
      )
    ORDER BY
      -- Listings with a known distance come first, closest wins.
      CASE WHEN lat IS NULL THEN 1 ELSE 0 END,
      distance_miles ASC NULLS LAST,
      fetched_at DESC
    LIMIT ${limit}
  `);

  const rows = rawResult as unknown as Array<{
    id: string;
    title: string;
    company_name: string | null;
    city: string | null;
    state: string | null;
    lat: string | null;
    lng: string | null;
    equipment_guess: string | null;
    salary_min_annual_usd: number | null;
    salary_max_annual_usd: number | null;
    salary_is_predicted: boolean;
    redirect_url: string;
    source: string;
    posted_at: Date | null;
    distance_miles: string | null;
  }>;

  return rows.map((r) => ({
    externalJobId: r.id,
    title: r.title,
    companyName: r.company_name,
    city: r.city,
    state: r.state,
    distanceMilesFromDriverHome:
      r.distance_miles == null
        ? null
        : Math.round(Number(r.distance_miles) * 10) / 10,
    payRangeMinWeekly: annualToWeekly(r.salary_min_annual_usd),
    payRangeMaxWeekly: annualToWeekly(r.salary_max_annual_usd),
    payIsEstimated: r.salary_is_predicted,
    source: r.source,
    redirectUrl: r.redirect_url,
    postedAt: r.posted_at,
  }));
}

/** Annual USD → rough weekly proxy (50 weeks/year). */
function annualToWeekly(annual: number | null): number | null {
  if (annual == null) return null;
  return Math.round(annual / 50);
}

/**
 * Upsert each listing into external_jobs. Conflict target is
 * (source, source_id) so re-fetching the same posting refreshes
 * fetched_at and field values rather than duplicating.
 */
async function upsertListings(
  database: typeof defaultDb,
  listings: ExternalJobListing[],
): Promise<void> {
  if (listings.length === 0) return;

  await database
    .insert(externalJobs)
    .values(
      listings.map((l) => ({
        source: l.source,
        sourceId: l.sourceId,
        title: l.title,
        companyName: l.companyName,
        city: l.city,
        state: l.state,
        lat: l.lat == null ? null : String(l.lat),
        lng: l.lng == null ? null : String(l.lng),
        equipmentGuess: l.equipmentGuess,
        salaryMinAnnualUsd: l.salaryMinAnnualUsd,
        salaryMaxAnnualUsd: l.salaryMaxAnnualUsd,
        salaryIsPredicted: l.salaryIsPredicted,
        descriptionExcerpt: l.descriptionExcerpt,
        redirectUrl: l.redirectUrl,
        postedAt: l.postedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [externalJobs.source, externalJobs.sourceId],
      set: {
        title: sql`EXCLUDED.title`,
        companyName: sql`EXCLUDED.company_name`,
        city: sql`EXCLUDED.city`,
        state: sql`EXCLUDED.state`,
        lat: sql`EXCLUDED.lat`,
        lng: sql`EXCLUDED.lng`,
        equipmentGuess: sql`EXCLUDED.equipment_guess`,
        salaryMinAnnualUsd: sql`EXCLUDED.salary_min_annual_usd`,
        salaryMaxAnnualUsd: sql`EXCLUDED.salary_max_annual_usd`,
        salaryIsPredicted: sql`EXCLUDED.salary_is_predicted`,
        descriptionExcerpt: sql`EXCLUDED.description_excerpt`,
        redirectUrl: sql`EXCLUDED.redirect_url`,
        postedAt: sql`EXCLUDED.posted_at`,
        fetchedAt: sql`NOW()`,
      },
    });
}

// Exported for tests.
export const __test__ = {
  CACHE_TTL_HOURS,
  DEFAULT_RADIUS_MILES,
  RELOCATE_RADIUS_MILES,
  annualToWeekly,
};
