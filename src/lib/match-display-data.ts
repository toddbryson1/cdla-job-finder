import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, jobPostingCycles } from "@/db/schema";
import { buildJobPostingSlug } from "@/lib/job-slug";

export interface MatchDisplayExtras {
  description: string | null;
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
  displaySigningBonusUsd: number | null;
  lastVerifiedAt: Date | null;
  /**
   * Canonical /job/[slug] URL for this job, pointing at the active
   * primary posting cycle. Null if no active cycle exists yet (the
   * daily cron seeds them but newly-synced jobs can be cycle-less for
   * a few hours).
   */
  jobPostingHref: string | null;
}

export async function loadDisplayExtras(
  jobIds: string[],
): Promise<Map<string, MatchDisplayExtras>> {
  const out = new Map<string, MatchDisplayExtras>();
  if (jobIds.length === 0) return out;

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
    });
  }
  return out;
}
