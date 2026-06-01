// USX DB writer. Imported lazily from scripts/import-usx.ts so the
// dotenv calls in the parent module take effect before db/client
// evaluates DATABASE_URL.

import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { carrierJobs, carriers } from "../src/db/schema";

// Shape mirrors scripts/import-usx.ts PreparedJob.
export interface PreparedJob {
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

const USX_RULES = {
  minExperienceMonths: 3,
  minExperienceMonthsLifetime: 12,
  minExperienceMonthsLifetimeWindowMonths: 120,
  acceptedCdlStates: [] as string[],
  requiredEndorsements: [] as string[],
  acceptsTerminated: true,
  acceptsFailedDotTest: false,
  sapTolerance: "accepts_none" as const,
  maxTickets3yr: 2,
  maxAccidents3yr: 3,
  maxAtFaultAccidents3yr: 1,
  acceptsDui: true,
  duiMaxRecencyMonths: 120,
  acceptsFelony: true,
  applicationUrl:
    "https://intelliapp.driverapponline.com/c/usxpress?r=chineithanableDLMPRO&release_signature_screen_submit_without_signing=y&uri_b=ia_usxpress_530409652",
  applicationSurface: "tenstreet_intelliapp" as const,
  publicCareersUrl: "https://www.usxpress.com/drivers",
  sourceUrl:
    "https://www.google.com/maps/d/u/0/viewer?mid=1aUf320Ipm7XkSGXJ4avGqkxBBNtVin8",
};

export async function writeAll(jobs: PreparedJob[]): Promise<void> {
  const carrierId = await ensureCarrier();

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  for (const j of jobs) {
    // Skip rows that would violate NOT NULL on domicile_lat/lng.
    // Carrier_jobs schema requires both. If lat/lng are missing
    // AND there's no polygon we can derive a centroid from, we
    // can't insert; flag for follow-up.
    const lat = j.domicileLat;
    const lng = j.domicileLng;
    if (!lat || !lng || Number.isNaN(Number(lat)) || Number.isNaN(Number(lng))) {
      skipped++;
      skipReasons.push(`${j.externalSourceId}: no valid lat/lng`);
      continue;
    }

    // Domicile city/state are NOT NULL in carrier_jobs. USX's
    // domicile_raw is account-named ("Family Dollar Front Royal") so
    // about 70% of rows don't carry an explicit state. We reverse-
    // geocode the polygon centroid against zip_codes to fill in the
    // state, and fall back to placeholders only as a last resort.
    let city = j.domicileCity;
    let state = j.domicileState;
    if (!state || !city) {
      const nearest = await nearestZip(Number(lat), Number(lng));
      if (nearest) {
        if (!state) state = nearest.state;
        if (!city) city = nearest.city;
      }
    }
    city = city ?? "Unknown";
    state = state ?? "XX";

    // The polygon column is `geography(Polygon, 4326)` on prod and
    // `text` locally (migration 0021). Pass the WKT string as a
    // plain value; Postgres on prod will implicitly cast text →
    // geography because of the SRID=4326 prefix, locally it stores
    // as text (matcher's runtime PostGIS check skips polygon SQL
    // there). Setting it in the INSERT itself (not a separate
    // UPDATE) so the OTR-invariant CHECK sees the polygon at
    // insert time.
    const polygonWktForInsert = j.hiringPolygonWkt
      ? `SRID=4326;${j.hiringPolygonWkt}`
      : null;

    const values = {
      carrierId,
      status: "active" as const, // carrier-level paused gates matching
      positionTitle: j.positionTitle,
      description: j.description,
      domicileCity: city,
      domicileState: state,
      domicileLat: lat,
      domicileLng: lng,
      hiringRadiusMiles: j.hiringRadiusMiles,
      hiringPolygon: polygonWktForInsert,
      equipment: j.equipment,
      minExperienceMonths: USX_RULES.minExperienceMonths,
      minExperienceMonthsLifetime: USX_RULES.minExperienceMonthsLifetime,
      minExperienceMonthsLifetimeWindowMonths:
        USX_RULES.minExperienceMonthsLifetimeWindowMonths,
      acceptedCdlStates: USX_RULES.acceptedCdlStates,
      requiredEndorsements: USX_RULES.requiredEndorsements,
      acceptedHomeTimeTypes: j.acceptedHomeTimeTypes as (
        | "daily"
        | "weekly"
        | "biweekly"
        | "otr"
      )[],
      payRangeMaxWeeklyUsd: j.payMax ?? null,
      acceptsTerminated: USX_RULES.acceptsTerminated,
      acceptsFailedDotTest: USX_RULES.acceptsFailedDotTest,
      sapTolerance: USX_RULES.sapTolerance,
      maxTickets3yr: USX_RULES.maxTickets3yr,
      maxAccidents3yr: USX_RULES.maxAccidents3yr,
      maxAtFaultAccidents3yr: USX_RULES.maxAtFaultAccidents3yr,
      acceptsDui: USX_RULES.acceptsDui,
      duiMaxRecencyMonths: USX_RULES.duiMaxRecencyMonths,
      acceptsFelony: USX_RULES.acceptsFelony,
      preferredEquipmentExperience: [] as string[],
      preferredRegions: [] as string[],
      applicationSurface: USX_RULES.applicationSurface,
      applicationUrl: USX_RULES.applicationUrl,
      lastApplicationSurfaceVerifiedAt: new Date(),
      dataSource: "manual_partner_intake" as const,
      sourceUrl: USX_RULES.sourceUrl,
      lastVerifiedAt: new Date(),
      verificationStatus: "verified" as const,
      dataQuality: j.dataQuality,
      externalSourceId: j.externalSourceId,
      displayPayRangeMinWeeklyUsd: j.payMin,
      displayPayRangeMaxWeeklyUsd: j.payMax,
      displaySigningBonusUsd: j.signOnBonus,
    };

    // Find-or-update by external_source_id. Drizzle's
    // onConflictDoUpdate would be cleaner but mixing the polygon's
    // raw SQL expression in there is awkward; explicit two-step is
    // straightforward and stays idempotent.
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

  console.log(
    `\nWrote ${inserted} new + ${updated} updated; ${skipped} skipped`,
  );
  for (const r of skipReasons) console.log(`  skip: ${r}`);
}

/**
 * Find the closest US zip code to a (lat, lng). Returns null when
 * the point doesn't fall within ~5 degrees of any US zip (e.g. way
 * out at sea). Uses a small bounding-box prefilter + haversine in
 * SQL so a single query handles each row.
 */
async function nearestZip(
  lat: number,
  lng: number,
): Promise<{ state: string; city: string } | null> {
  const rows = (await db.execute(sql`
    SELECT state, city
    FROM zip_codes
    WHERE lat BETWEEN ${lat}::numeric - 1 AND ${lat}::numeric + 1
      AND lng BETWEEN ${lng}::numeric - 1 AND ${lng}::numeric + 1
    ORDER BY
      (lat - ${lat}::numeric) * (lat - ${lat}::numeric) +
      (lng - ${lng}::numeric) * (lng - ${lng}::numeric) ASC
    LIMIT 1
  `)) as unknown as Array<{ state: string; city: string }>;
  if (rows.length === 0) return null;
  return rows[0];
}

async function ensureCarrier(): Promise<string> {
  const existing = await db
    .select({ id: carriers.id, status: carriers.status })
    .from(carriers)
    .where(eq(carriers.name, "U.S. Xpress"))
    .limit(1);

  if (existing.length > 0) {
    console.log(
      `  carriers.U.S. Xpress already exists (id=${existing[0].id}, status=${existing[0].status}) — leaving as is`,
    );
    return existing[0].id;
  }

  const [row] = await db
    .insert(carriers)
    .values({
      name: "U.S. Xpress",
      kind: "partner",
      tier: "none",
      status: "paused",
      publicCareersUrl: USX_RULES.publicCareersUrl,
    })
    .returning({ id: carriers.id });
  if (!row) throw new Error("Failed to insert carriers row");
  console.log(`  created carriers.U.S. Xpress (id=${row.id}, status=paused)`);
  return row.id;
}
