import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, jobPostingCycles } from "@/db/schema";
import { buildJobPostingSlug } from "@/lib/job-slug";
import { isPostgisAvailable } from "@/lib/matching/hardFilter";

export interface MatchDisplayExtras {
  description: string | null;
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
  displaySigningBonusUsd: number | null;
  lastVerifiedAt: Date | null;
  /** Minimum recent (3-yr) driving experience required, in months. */
  minExperienceMonths: number | null;
  /** Endorsements the carrier requires (e.g. "H" hazmat, "N" tanker). */
  requiredEndorsements: string[];
  /** What CDL states the carrier accepts. Empty array = no restriction. */
  acceptedCdlStates: string[];
  /**
   * Canonical /job/[slug] URL for this job, pointing at the active
   * primary posting cycle. Null if no active cycle exists yet (the
   * daily cron seeds them but newly-synced jobs can be cycle-less for
   * a few hours).
   */
  jobPostingHref: string | null;
  /**
   * "Best available" prose for the chat MatchCard snippet and the
   * /matches MatchCard body. Prefers the long-form `description` when
   * it has real content (≥60 chars after trim). Otherwise composes
   * a one-line fallback from display_lane_description +
   * display_home_time_description + display_benefits_summary, joined
   * with periods so it reads as prose.
   *
   * This exists because Swift / USX / PAM and a few other API-sourced
   * carriers populate only the structured display fields (not the
   * long-form `description`). The chat used to render those cards
   * with no description text at all — driver-visible regression caught
   * walking prod on 2026-06-02.
   *
   * Null only when *every* underlying field is null — a genuinely
   * undescribed job, which the chat / matches card drops cleanly.
   */
  displayDescription: string | null;
  // Running-area map data. domicile = the carrier terminal/centroid pin;
  // hiringRadiusMiles draws the circular area (null = OTR/nationwide);
  // hiringPolygonGeoJson is the real hiring area when set (PostGIS only,
  // null on a DB without PostGIS or when the job has no polygon).
  domicileLat: number | null;
  domicileLng: number | null;
  hiringRadiusMiles: number | null;
  hiringPolygonGeoJson: string | null;
}

/**
 * Compose a prose-shaped fallback when the canonical `description`
 * is null or thin. Joins the structured display fields with periods
 * + spaces so the result reads naturally in a single paragraph.
 * Returns null when nothing usable is available.
 *
 * Exported for unit tests; not used outside this module.
 */
export function composeDisplayDescription(input: {
  description: string | null;
  displayLaneDescription: string | null;
  displayHomeTimeDescription: string | null;
  displayBenefitsSummary: string | null;
}): string | null {
  // Use the canonical description when it has real content — a 1-line
  // "OTR" is technically non-null but adds no value beyond the
  // position title + equipment label already on the card. Threshold
  // tuned so the most common stub strings get filtered.
  const canonical = (input.description ?? "").trim();
  if (canonical.length >= 60) return canonical;

  const pieces: string[] = [];
  for (const raw of [
    input.displayLaneDescription,
    input.displayHomeTimeDescription,
    input.displayBenefitsSummary,
  ]) {
    if (!raw) continue;
    const t = raw.trim();
    if (t.length === 0) continue;
    // Strip trailing punctuation so we control the join below.
    pieces.push(t.replace(/[.!?,;:\s]+$/, ""));
  }
  if (pieces.length === 0) {
    // Fall back to the canonical description even if short — a 1-word
    // value is better than nothing on the card.
    return canonical.length > 0 ? canonical : null;
  }
  return pieces.join(". ") + ".";
}

export async function loadDisplayExtras(
  jobIds: string[],
): Promise<Map<string, MatchDisplayExtras>> {
  const out = new Map<string, MatchDisplayExtras>();
  if (jobIds.length === 0) return out;

  // ST_AsGeoJSON only exists when PostGIS is installed (prod/Neon). On a
  // PostGIS-less DB (local Homebrew) emit NULL so the query still parses —
  // same guard the matcher uses. Polygon-less jobs fall back to the radius
  // circle drawn client-side.
  const postgis = await isPostgisAvailable();
  const polygonExpr = postgis
    ? sql<string | null>`ST_AsGeoJSON(${carrierJobs.hiringPolygon})`
    : sql<string | null>`NULL`;

  const rows = await db
    .select({
      id: carrierJobs.id,
      description: carrierJobs.description,
      displayHomeTimeDescription: carrierJobs.displayHomeTimeDescription,
      displayLaneDescription: carrierJobs.displayLaneDescription,
      displayBenefitsSummary: carrierJobs.displayBenefitsSummary,
      displaySigningBonusUsd: carrierJobs.displaySigningBonusUsd,
      lastVerifiedAt: carrierJobs.lastVerifiedAt,
      positionTitle: carrierJobs.positionTitle,
      carrierName: carriers.name,
      minExperienceMonths: carrierJobs.minExperienceMonths,
      requiredEndorsements: carrierJobs.requiredEndorsements,
      acceptedCdlStates: carrierJobs.acceptedCdlStates,
      domicileLat: carrierJobs.domicileLat,
      domicileLng: carrierJobs.domicileLng,
      hiringRadiusMiles: carrierJobs.hiringRadiusMiles,
      hiringPolygonGeoJson: polygonExpr,
    })
    .from(carrierJobs)
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(inArray(carrierJobs.id, jobIds));

  // Look up the active primary cycle per job (or the most recent
  // active cycle if there's no primary — fallback). One query covers
  // all jobs; bucket by job_id client-side.
  const cycleRows = await db
    .select({
      jobId: jobPostingCycles.jobId,
      cycleId: jobPostingCycles.id,
      city: jobPostingCycles.city,
      state: jobPostingCycles.state,
      isPrimary: jobPostingCycles.isPrimary,
      postedAt: jobPostingCycles.postedAt,
    })
    .from(jobPostingCycles)
    .where(
      and(
        inArray(jobPostingCycles.jobId, jobIds),
        eq(jobPostingCycles.status, "active"),
      ),
    )
    .orderBy(sql`${jobPostingCycles.isPrimary} DESC, ${jobPostingCycles.postedAt} DESC`);

  // First cycle for each job in this ordering is the one we want.
  const bestCycleByJob = new Map<string, (typeof cycleRows)[number]>();
  for (const c of cycleRows) {
    if (!bestCycleByJob.has(c.jobId)) bestCycleByJob.set(c.jobId, c);
  }

  for (const r of rows) {
    const cycle = bestCycleByJob.get(r.id);
    const jobPostingHref = cycle
      ? `/job/${buildJobPostingSlug(
          { name: r.carrierName },
          {
            id: cycle.cycleId,
            positionTitle: r.positionTitle,
            domicileCity: cycle.city,
            domicileState: cycle.state,
          },
        )}`
      : null;

    out.set(r.id, {
      description: r.description,
      displayHomeTimeDescription: r.displayHomeTimeDescription,
      displayLaneDescription: r.displayLaneDescription,
      displayBenefitsSummary: r.displayBenefitsSummary,
      displaySigningBonusUsd: r.displaySigningBonusUsd,
      lastVerifiedAt: r.lastVerifiedAt,
      jobPostingHref,
      displayDescription: composeDisplayDescription({
        description: r.description,
        displayLaneDescription: r.displayLaneDescription,
        displayHomeTimeDescription: r.displayHomeTimeDescription,
        displayBenefitsSummary: r.displayBenefitsSummary,
      }),
      minExperienceMonths: r.minExperienceMonths,
      requiredEndorsements: r.requiredEndorsements ?? [],
      acceptedCdlStates: r.acceptedCdlStates ?? [],
      domicileLat: r.domicileLat == null ? null : Number(r.domicileLat),
      domicileLng: r.domicileLng == null ? null : Number(r.domicileLng),
      hiringRadiusMiles: r.hiringRadiusMiles ?? null,
      hiringPolygonGeoJson: r.hiringPolygonGeoJson ?? null,
    });
  }
  return out;
}
