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

export interface DriverProfile {
  id: string;
  homeLat: number;
  homeLng: number;
  willingToRelocate: boolean;
  desiredEquipment: string[];
  experienceMonths: number;
  otrExperienceMonths: number;
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
      CASE
        WHEN j.hiring_radius_miles IS NULL THEN NULL
        ELSE 3959 * acos(
          LEAST(1.0, GREATEST(-1.0,
            cos(radians(${homeLat}::numeric)) * cos(radians(j.domicile_lat)) *
            cos(radians(j.domicile_lng) - radians(${homeLng}::numeric)) +
            sin(radians(${homeLat}::numeric)) * sin(radians(j.domicile_lat))
          ))
        )
      END AS distance_miles,
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
      -- Geospatial filter has three pass-conditions, applied to both
      -- the bounding-box prefilter and the exact haversine check below.
      --
      -- (a) OTR job (NULL hiring_radius_miles) AND driver explicitly
      --     wants OTR. The radius=NULL convention means "this job is
      --     OTR — hires nationwide". A driver who didn't pick OTR
      --     shouldn't match these even if their home_time array
      --     happens to overlap (e.g., a misconfigured Swift job that
      --     lists ['weekly', 'otr'] for an OTR lane).
      -- (b) Willing to relocate AND driver wants OTR AND job accepts
      --     OTR. The driver will move to the job's hiring zone for an
      --     OTR seat regardless of the standard radius.
      -- (c) Job's domicile is geographically inside the driver's
      --     ~250mi bounding box (and, in the second clause, within
      --     the carrier's stated hiring_radius_miles).
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
      -- Exact geospatial filter (haversine).
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
      AND j.equipment = ANY(${desiredEquipment}::text[])
      -- desiredEquipment serialized via toPgTextArray
      AND j.min_experience_months <= ${driver.experienceMonths}
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
