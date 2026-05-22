import type { QualificationResult, Stage2Data } from "./types";

/**
 * Stage 2 qualifying surface — checks Stage 2 driver fields (tickets,
 * accidents, DUI, felony) against the job's Stage 2 rule fields. NOT
 * implemented in this build session per the matching engine v2 prompt;
 * the signature exists so the call site is correct and the implementation
 * can be filled in by a future Stage 2 session.
 */
export async function qualifyDriverForCarrier(
  _driverId: string,
  _jobId: string,
  _stage2Data: Stage2Data,
): Promise<QualificationResult> {
  throw new Error(
    "qualifyDriverForCarrier is not implemented in this build session.",
  );
}
