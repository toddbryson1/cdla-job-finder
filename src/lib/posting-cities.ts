// City picker for posting cycles.
//
// Given a carrier_job, return candidate (city, state, zip, lat, lng)
// tuples we can post the job in. Constraints, in order:
//
//   1. Each candidate is within the carrier's hiring_radius_miles of
//      domicile. OTR jobs (null radius) default to a 250-mile pool
//      around the domicile — OTR copy still names a "home base" city,
//      so we want SEO reach across that metro, not across the country.
//   2. Each candidate is ≥50 miles from every OTHER candidate we
//      return (the user's explicit rule — don't double-post in cities
//      that overlap each other's local-search zone).
//   3. Each candidate is ≥50 miles from every city that already has
//      an active posting cycle for this job (so simultaneous cycles
//      across cities respect the same rule).
//   4. Rotation bias: cities that have been the primary in recent
//      cycles drop in priority. We want competition coverage — if the
//      carrier always lists in Phoenix, our value is ranking on Mesa,
//      Scottsdale, Glendale.

import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, jobPostingCycles, zipCodes } from "@/db/schema";

export interface PostingCity {
  city: string;
  state: string;
  zip: string;
  lat: number;
  lng: number;
  /** Distance from the carrier's domicile in miles. */
  distanceMiles: number;
}

export interface PickCitiesOptions {
  /** Max cities to return per pick. Default 4. */
  maxCities?: number;
  /** Override the spacing rule. Default 50 miles. */
  minSpacingMiles?: number;
  /** OTR fallback radius when hiring_radius_miles is null. */
  otrFallbackRadiusMiles?: number;
}

const DEFAULT_SPACING_MILES = 50;
const DEFAULT_MAX_CITIES = 4;
const DEFAULT_OTR_FALLBACK_RADIUS = 250;

type CarrierJob = typeof carrierJobs.$inferSelect;

/**
 * Pick candidate posting cities for a job.
 *
 * Returns the domicile city first (always — that's the carrier's
 * canonical claim), then up to maxCities-1 additional cities chosen
 * greedily by descending zip-table presence (rough city size proxy)
 * with spacing + rotation constraints applied.
 */
export async function pickPostingCities(
  job: CarrierJob,
  opts: PickCitiesOptions = {},
): Promise<PostingCity[]> {
  const maxCities = opts.maxCities ?? DEFAULT_MAX_CITIES;
  const minSpacing = opts.minSpacingMiles ?? DEFAULT_SPACING_MILES;
  const otrFallback =
    opts.otrFallbackRadiusMiles ?? DEFAULT_OTR_FALLBACK_RADIUS;

  if (job.domicileLat == null || job.domicileLng == null) return [];
  const originLat = Number(job.domicileLat);
  const originLng = Number(job.domicileLng);
  const radiusMiles = job.hiringRadiusMiles ?? otrFallback;

  // Pull every city (one row per distinct city+state) within the radius
  // along with the count of zips in that city as a city-size proxy.
  // Haversine distance in miles (3958.8 = earth radius mi).
  const rows = (await db.execute(sql`
    SELECT
      city,
      state,
      MIN(zip) AS zip,
      AVG(lat::float) AS lat,
      AVG(lng::float) AS lng,
      COUNT(*)::int AS zip_count,
      MIN(
        3958.8 * ACOS(
          LEAST(1, GREATEST(-1,
            COS(RADIANS(${originLat})) * COS(RADIANS(lat::float))
              * COS(RADIANS(lng::float) - RADIANS(${originLng}))
            + SIN(RADIANS(${originLat})) * SIN(RADIANS(lat::float))
          ))
        )
      ) AS distance_miles
    FROM zip_codes
    WHERE 3958.8 * ACOS(
      LEAST(1, GREATEST(-1,
        COS(RADIANS(${originLat})) * COS(RADIANS(lat::float))
          * COS(RADIANS(lng::float) - RADIANS(${originLng}))
        + SIN(RADIANS(${originLat})) * SIN(RADIANS(lat::float))
      ))
    ) <= ${radiusMiles}
    GROUP BY city, state
    ORDER BY zip_count DESC, distance_miles ASC
    LIMIT 200
  `)) as unknown as Array<{
    city: string;
    state: string;
    zip: string;
    lat: number;
    lng: number;
    zip_count: number;
    distance_miles: number;
  }>;

  if (rows.length === 0) return [];

  // Convert to candidates and force domicile city to the head of the list.
  const candidates: PostingCity[] = rows.map((r) => ({
    city: r.city,
    state: r.state,
    zip: r.zip,
    lat: Number(r.lat),
    lng: Number(r.lng),
    distanceMiles: Number(r.distance_miles),
  }));

  // Rotation bias: cities used as a primary in the most-recent expired
  // cycles for this job drop in priority. We sort the tail of the list
  // (after the domicile) by how long it's been since they were primary.
  const recentPrimaries = await db
    .select({ city: jobPostingCycles.city, state: jobPostingCycles.state })
    .from(jobPostingCycles)
    .where(eq(jobPostingCycles.jobId, job.id))
    .orderBy(sql`${jobPostingCycles.postedAt} DESC`)
    .limit(10);
  const recencyRank = new Map<string, number>();
  recentPrimaries.forEach((p, i) =>
    recencyRank.set(cityKey(p.city, p.state), i),
  );

  // Find and pull domicile to the front (it's always a candidate).
  const domicileIdx = candidates.findIndex(
    (c) =>
      sameCity(c.city, job.domicileCity) &&
      c.state.toUpperCase() === job.domicileState.toUpperCase(),
  );
  const head: PostingCity[] =
    domicileIdx >= 0 ? [candidates[domicileIdx]] : [];
  const tail = candidates.filter((_, i) => i !== domicileIdx);

  // Sort tail: stronger cities first (higher zip_count is already the
  // primary sort from SQL), but de-prioritize recently-used cities.
  // We do this by stable-sorting by recency-not-found-first.
  tail.sort((a, b) => {
    const ra = recencyRank.get(cityKey(a.city, a.state)) ?? Infinity;
    const rb = recencyRank.get(cityKey(b.city, b.state)) ?? Infinity;
    return rb - ra; // higher index = less recent = preferred
  });

  // Existing active cycles' cities are hard exclusions (we don't want
  // to spawn a new active cycle that conflicts with one already running
  // for this job in the same metro pocket).
  const activeCycles = await db
    .select({ city: jobPostingCycles.city, state: jobPostingCycles.state })
    .from(jobPostingCycles)
    .where(
      sql`${jobPostingCycles.jobId} = ${job.id} AND ${jobPostingCycles.status} = 'active'`,
    );
  const activeCityKeys = new Set(
    activeCycles.map((c) => cityKey(c.city, c.state)),
  );

  // Greedy pack with the ≥minSpacing rule. Domicile goes first (head),
  // then each tail candidate is added only if it's ≥minSpacing miles
  // from EVERY already-picked candidate.
  const picked: PostingCity[] = [];
  for (const c of [...head, ...tail]) {
    if (picked.length >= maxCities) break;
    if (activeCityKeys.has(cityKey(c.city, c.state))) {
      // City already has an active cycle for this job — don't duplicate.
      // But if this is the domicile and there's no active cycle from
      // head yet, still allow it (the spawner handles that case by
      // checking before calling).
      continue;
    }
    const conflict = picked.some(
      (p) => haversineMiles(p.lat, p.lng, c.lat, c.lng) < minSpacing,
    );
    if (conflict) continue;
    picked.push(c);
  }

  return picked;
}

function cityKey(city: string, state: string): string {
  return `${city.toLowerCase()}|${state.toUpperCase()}`;
}

function sameCity(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

/**
 * Great-circle distance in miles between two (lat, lng) pairs.
 * Exported so the spawner can reuse it for sanity checks.
 */
export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.8; // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
