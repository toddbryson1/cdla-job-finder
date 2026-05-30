import { sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";

// Serialize a string array to a Postgres array literal. Drizzle's sql template
// emits "()" for empty JS arrays, which is invalid; we route arrays through a
// scalar string parameter cast to ::text[] instead.
function toPgTextArray(values: string[]): string {
  if (values.length === 0) return "{}";
  const escaped = values.map(
    (v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${escaped.join(",")}}`;
}

/**
 * Module-cached PostGIS-availability check.
 *
 * The polygon hiring-area filter relies on ST_Contains. Calling that
 * on a Postgres without PostGIS installed (e.g. local Homebrew
 * postgresql@16 without the matching postgis package) fails at SQL
 * parse time even if no row would actually hit the branch. So we
 * detect once at first matcher call and build the SQL accordingly.
 *
 * On Neon prod PostGIS is installed → polygon path active.
 * On local without PostGIS → polygon path omitted, classic
 * haversine-only behavior. (We seed no polygon rows locally anyway,
 * so behavior is correct either way.)
 *
 * Exported for tests that need to force the cache.
 */
let _postgisAvailable: Promise<boolean> | null = null;
export async function isPostgisAvailable(
  database: typeof defaultDb = defaultDb,
): Promise<boolean> {
  if (_postgisAvailable != null) return _postgisAvailable;
  _postgisAvailable = (async () => {
    try {
      const rows = (await database.execute(
        sql`SELECT 1 FROM pg_extension WHERE extname = 'postgis' LIMIT 1`,
      )) as unknown as unknown[];
      return rows.length > 0;
    } catch {
      return false;
    }
  })();
  return _postgisAvailable;
}
export function __resetPostgisCache(): void {
  _postgisAvailable = null;
}

export interface DriverProfile {
  id: string;
  homeLat: number;
  homeLng: number;
  willingToRelocate: boolean;
  desiredEquipment: string[];
  experienceMonths: number;
  otrExperienceMonths: number;
  /**
   * Total verified CDL-A tractor-trailer months over the driver's
   * whole career. Powers the lifetime-experience qualifying path
   * (Path B). null on pre-Path-B intake rows → driver only matches
   * via the 36-month Path A filter.
   */
  totalCareerExperienceMonths: number | null;
  /**
   * Months since the driver last drove commercially. 0 = currently
   * driving. null on pre-Path-B intake rows. Used together with
   * `min_experience_months_lifetime_window_months` so a carrier
   * that says "12 months in the last 10 years" rejects a driver
   * who has been out longer than 10 years.
   */
  monthsSinceLastDrove: number | null;
  cdlState: string;
  endorsements: string[];
  homeTime: string[];
  minWeeklyPay: number;
  terminated: boolean;
  failedDot: boolean;
  sapStatus: "not-in-sap" | "in-sap" | "completed-sap";
}

export interface CandidateRow {
  job_id: string;
  carrier_id: string;
  carrier_name: string;
  carrier_kind: "partner" | "prospect" | "subscription";
  carrier_tier: "tier_1" | "tier_2" | "none";
  tier_1_billing_status: "current" | "past_due" | "cancelled" | null;
  position_title: string;
  equipment: string;
  domicile_city: string;
  domicile_state: string;
  hiring_radius_miles: number | null;
  distance_miles: number | null;
  pay_range_max_weekly_usd: number | null;
  display_pay_range_min_weekly_usd: number | null;
  display_pay_range_max_weekly_usd: number | null;
  preferred_equipment_experience: string[];
  preferred_regions: string[];
  application_surface:
    | "tenstreet_intelliapp"
    | "custom_intake_form"
    | "email_only"
    | "phone_only"
    | "unknown";
  application_url: string | null;
  application_phone: string | null;
  last_verified_at: Date | null;
  verification_status: "verified" | "stale" | "unverified";
  data_quality: "complete" | "partial" | "minimal";
}

export async function runHardFilter(
  driver: DriverProfile,
  database: typeof defaultDb = defaultDb,
): Promise<CandidateRow[]> {
  const sapStatus = driver.sapStatus;
  const desiredEquipment = toPgTextArray(driver.desiredEquipment);
  const endorsements = toPgTextArray(driver.endorsements);
  const homeTime = toPgTextArray(driver.homeTime);
  const homeLat = driver.homeLat;
  const homeLng = driver.homeLng;
  const willingToRelocate = driver.willingToRelocate;
  const totalCareerMonths = driver.totalCareerExperienceMonths;
  const monthsSinceLastDrove = driver.monthsSinceLastDrove;

  const postgis = await isPostgisAvailable(database);

  // Polygon hiring-area branch. When PostGIS is available and a job
  // has a hiring_polygon set, the driver passes the geo check iff
  // their home is contained by the polygon — the polygon TAKES
  // PRECEDENCE over the radius circle even if they'd pass the
  // radius (USX explicitly geo-fences these out).
  const polygonPass = postgis
    ? sql`
        (j.hiring_polygon IS NOT NULL
          AND ST_Contains(
            j.hiring_polygon::geometry,
            ST_SetSRID(ST_MakePoint(${homeLng}::numeric, ${homeLat}::numeric), 4326)
          ))
      `
    : sql`FALSE`;

  // When PostGIS isn't available, treat hiring_polygon as never set so
  // those rows fall through to the radius branch (which will reject
  // them since no row should have polygon-only geofencing on a
  // PostGIS-less DB).
  const polygonExists = postgis
    ? sql`(j.hiring_polygon IS NOT NULL)`
    : sql`FALSE`;

  const rawResult = await database.execute(sql`
    SELECT
      j.id AS job_id,
      j.carrier_id,
      c.name AS carrier_name,
      c.kind AS carrier_kind,
      c.tier AS carrier_tier,
      c.tier_1_billing_status,
      j.position_title,
      j.equipment,
      j.domicile_city,
      j.domicile_state,
      j.hiring_radius_miles,
      -- Distance score for soft-rank. When a polygon is present we
      -- measure from its centroid (per the prompt). Otherwise from
      -- the domicile point. NULL distance keeps the OTR-no-radius
      -- behavior for jobs without either a polygon or a radius.
      ${
        postgis
          ? sql`
        CASE
          WHEN j.hiring_polygon IS NOT NULL THEN 3959 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${homeLat}::numeric)) * cos(radians(ST_Y(ST_Centroid(j.hiring_polygon::geometry)))) *
              cos(radians(ST_X(ST_Centroid(j.hiring_polygon::geometry))) - radians(${homeLng}::numeric)) +
              sin(radians(${homeLat}::numeric)) * sin(radians(ST_Y(ST_Centroid(j.hiring_polygon::geometry))))
            ))
          )
          WHEN j.hiring_radius_miles IS NULL THEN NULL
          ELSE 3959 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${homeLat}::numeric)) * cos(radians(j.domicile_lat)) *
              cos(radians(j.domicile_lng) - radians(${homeLng}::numeric)) +
              sin(radians(${homeLat}::numeric)) * sin(radians(j.domicile_lat))
            ))
          )
        END
      `
          : sql`
        CASE
          WHEN j.hiring_radius_miles IS NULL THEN NULL
          ELSE 3959 * acos(
            LEAST(1.0, GREATEST(-1.0,
              cos(radians(${homeLat}::numeric)) * cos(radians(j.domicile_lat)) *
              cos(radians(j.domicile_lng) - radians(${homeLng}::numeric)) +
              sin(radians(${homeLat}::numeric)) * sin(radians(j.domicile_lat))
            ))
          )
        END
      `
      } AS distance_miles,
      j.pay_range_max_weekly_usd,
      j.display_pay_range_min_weekly_usd,
      j.display_pay_range_max_weekly_usd,
      j.preferred_equipment_experience,
      j.preferred_regions,
      j.application_surface,
      j.application_url,
      j.application_phone,
      j.last_verified_at,
      j.verification_status,
      j.data_quality
    FROM carrier_jobs j
    INNER JOIN carriers c ON c.id = j.carrier_id
    WHERE c.status = 'active' AND j.status = 'active'
      -- Geospatial filter. There are now four pass-conditions:
      --
      -- (a) Polygon hiring area (when set): point-in-polygon test
      --     against driver home. Takes precedence — outside-polygon
      --     drivers fail even if they'd be within the radius. (USX
      --     uses these to geo-fence drivers in/out of state-line
      --     hiring zones.)
      -- (b) OTR job (NULL hiring_radius_miles AND no polygon) AND
      --     driver explicitly wants OTR.
      -- (c) Willing to relocate AND driver wants OTR AND job
      --     accepts OTR.
      -- (d) Job's domicile is geographically within the driver's
      --     bounding box (prefilter), AND within hiring_radius_miles
      --     (exact haversine).
      --
      -- When a row has a polygon, branches (b)-(d) are skipped — the
      -- polygon is the ONLY accepted-area definition for that job.
      AND (
        -- Polygon-only path (takes precedence when present).
        ${polygonPass}
        -- Otherwise the existing circle-based pass conditions.
        OR (
          NOT ${polygonExists}
          AND (
            (j.hiring_radius_miles IS NULL
              AND 'otr' = ANY(${homeTime}::home_time[]))
            OR (${willingToRelocate}::boolean
                AND 'otr' = ANY(j.accepted_home_time_types)
                AND 'otr' = ANY(${homeTime}::home_time[]))
            OR (
              j.domicile_lat BETWEEN ${homeLat}::numeric - 4 AND ${homeLat}::numeric + 4
              AND j.domicile_lng BETWEEN ${homeLng}::numeric - 4 AND ${homeLng}::numeric + 4
            )
          )
        )
      )
      -- Exact geospatial filter (haversine). Same structure: polygon
      -- branch passes by itself, circle branch needs the haversine.
      AND (
        ${polygonPass}
        OR (
          NOT ${polygonExists}
          AND (
            (j.hiring_radius_miles IS NULL
              AND 'otr' = ANY(${homeTime}::home_time[]))
            OR (${willingToRelocate}::boolean
                AND 'otr' = ANY(j.accepted_home_time_types)
                AND 'otr' = ANY(${homeTime}::home_time[]))
            OR 3959 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians(${homeLat}::numeric)) * cos(radians(j.domicile_lat)) *
                cos(radians(j.domicile_lng) - radians(${homeLng}::numeric)) +
                sin(radians(${homeLat}::numeric)) * sin(radians(j.domicile_lat))
              ))
            ) <= j.hiring_radius_miles
          )
        )
      )
      AND j.equipment = ANY(${desiredEquipment}::text[])
      -- desiredEquipment serialized via toPgTextArray.
      --
      -- Experience filter — driver passes if EITHER:
      --   Path A: current experience (last 36 mo) >= min_experience_months
      --   Path B: total career experience >= min_experience_months_lifetime
      --           AND (no window OR months_since_last_drove <= window)
      --
      -- Path B requires lifetime fields on BOTH sides. Driver-side
      -- NULLs (pre-Path-B intake rows) fail Path B closed so the
      -- driver only matches via Path A.
      AND (
        j.min_experience_months <= ${driver.experienceMonths}
        OR (
          j.min_experience_months_lifetime IS NOT NULL
          AND ${totalCareerMonths === null ? sql`NULL::int` : sql`${totalCareerMonths}::int`}
              >= j.min_experience_months_lifetime
          AND (
            j.min_experience_months_lifetime_window_months IS NULL
            OR (
              ${monthsSinceLastDrove === null ? sql`NULL::int` : sql`${monthsSinceLastDrove}::int`}
                <= j.min_experience_months_lifetime_window_months
            )
          )
        )
      )
      AND (
        j.min_otr_experience_months IS NULL
        OR j.min_otr_experience_months <= ${driver.otrExperienceMonths}
      )
      AND (
        cardinality(j.accepted_cdl_states) = 0
        OR ${driver.cdlState} = ANY(j.accepted_cdl_states)
      )
      AND j.required_endorsements <@ ${endorsements}::text[]
      AND j.accepted_home_time_types && ${homeTime}::home_time[]
      AND (
        ${driver.minWeeklyPay} = 0
        OR j.pay_range_max_weekly_usd IS NULL
        OR j.pay_range_max_weekly_usd >= ${driver.minWeeklyPay}
      )
      AND (NOT ${driver.terminated}::boolean OR j.accepts_terminated = TRUE)
      AND (NOT ${driver.failedDot}::boolean OR j.accepts_failed_dot_test = TRUE)
      AND (
        (${sapStatus} = 'not-in-sap')
        OR (${sapStatus} = 'completed-sap' AND j.sap_tolerance IN ('accepts_completed_only', 'accepts_all'))
        OR (${sapStatus} = 'in-sap' AND j.sap_tolerance = 'accepts_all')
      )
  `);

  const result = rawResult as unknown as CandidateRow[];

  return result.map((r) => ({
    ...r,
    distance_miles: r.distance_miles == null ? null : Number(r.distance_miles),
    hiring_radius_miles:
      r.hiring_radius_miles == null ? null : Number(r.hiring_radius_miles),
    pay_range_max_weekly_usd:
      r.pay_range_max_weekly_usd == null
        ? null
        : Number(r.pay_range_max_weekly_usd),
    display_pay_range_min_weekly_usd:
      r.display_pay_range_min_weekly_usd == null
        ? null
        : Number(r.display_pay_range_min_weekly_usd),
    display_pay_range_max_weekly_usd:
      r.display_pay_range_max_weekly_usd == null
        ? null
        : Number(r.display_pay_range_max_weekly_usd),
  }));
}
