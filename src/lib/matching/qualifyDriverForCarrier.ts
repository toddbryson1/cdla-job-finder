import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs } from "@/db/schema";
import type { QualificationResult, Stage2Data } from "./types";

// Stage 2 hard filters from Field Schema v2.1 §4 (lower half).
// Runs against the carrier's Stage 2 rule fields on carrier_jobs. NULL rule
// fields on the job mean the carrier has not specified a cutoff — default
// to qualified rather than disqualifying on missing carrier data.
export async function qualifyDriverForCarrier(
  _driverId: string,
  jobId: string,
  stage2Data: Stage2Data,
  options: { now?: Date } = {},
): Promise<QualificationResult> {
  const now = options.now ?? new Date();
  const job = await db.query.carrierJobs.findFirst({
    where: eq(carrierJobs.id, jobId),
  });

  if (!job) {
    return { qualifies: false, reasons: ["job_not_found"] };
  }

  const reasons: string[] = [];

  if (
    job.maxTickets3yr != null &&
    stage2Data.tickets3yrCount > job.maxTickets3yr
  ) {
    reasons.push("tickets_over_max");
  }

  if (
    job.maxAccidents3yr != null &&
    stage2Data.accidents3yrCount > job.maxAccidents3yr
  ) {
    reasons.push("accidents_over_max");
  }

  if (
    job.maxAtFaultAccidents3yr != null &&
    stage2Data.accidents3yrAtFaultCount > job.maxAtFaultAccidents3yr
  ) {
    reasons.push("at_fault_accidents_over_max");
  }

  if (stage2Data.duiEver) {
    if (!job.acceptsDui) {
      reasons.push("dui_not_accepted");
    } else if (job.duiMaxRecencyMonths != null) {
      if (!stage2Data.duiMostRecentDate) {
        reasons.push("dui_date_unknown");
      } else {
        const cutoff = new Date(now);
        cutoff.setMonth(cutoff.getMonth() - job.duiMaxRecencyMonths);
        if (stage2Data.duiMostRecentDate >= cutoff) {
          reasons.push("dui_too_recent");
        }
      }
    }
  }

  if (stage2Data.felonyEver && !job.acceptsFelony) {
    reasons.push("felony_not_accepted");
  }

  return { qualifies: reasons.length === 0, reasons };
}
