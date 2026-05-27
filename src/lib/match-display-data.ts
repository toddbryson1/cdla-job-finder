import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs } from "@/db/schema";

export interface MatchDisplayExtras {
  description: string | null;
  displayHomeTimeDescription: string | null;
  displayLaneDescription: string | null;
  displayBenefitsSummary: string | null;
  displaySigningBonusUsd: number | null;
  lastVerifiedAt: Date | null;
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
    })
    .from(carrierJobs)
    .where(inArray(carrierJobs.id, jobIds));

  for (const r of rows) {
    out.set(r.id, {
      description: r.description,
      displayHomeTimeDescription: r.displayHomeTimeDescription,
      displayLaneDescription: r.displayLaneDescription,
      displayBenefitsSummary: r.displayBenefitsSummary,
      displaySigningBonusUsd: r.displaySigningBonusUsd,
      lastVerifiedAt: r.lastVerifiedAt,
    });
  }
  return out;
}
