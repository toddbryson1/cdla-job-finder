// Queries powering the /me driver dashboard. Read-only. Each
// function returns a small focused shape — the page composes them.
//
// Auth happens at the route layer (cookie OR Stytch session); these
// queries assume the caller has already verified the driver belongs
// to the requester.

import { desc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  driverCarrierApplications,
  partnerApplicationStages,
} from "@/db/schema";

/** Per-application summary the dashboard renders one row per. */
export interface DriverApplicationRow {
  /** UUID — also the driverCarrierApplications row id. Used as a key. */
  applicationId: string;
  carrierId: string;
  carrierName: string;
  jobId: string;
  positionTitle: string;
  domicileCity: string;
  domicileState: string;
  equipment: string;
  consentedAt: Date;
  /** From the matching engine's most recent qualification pass. */
  lastQualified: boolean | null;
  /** Per-handoff stage when this carrier uses a partner pipeline
   *  (Anderson Sterling / QuickBase). Null when the carrier is a
   *  generic IntelliApp / email / phone applier. */
  partnerStage:
    | "apply_initiated"
    | "stage2_consented"
    | "intelliapp_link_sent"
    | "submitted_to_sterling"
    | "submit_failed_validation"
    | "submit_queued_for_retry"
    | "stalled"
    | null;
  /** Sterling-issued record ID when the partner push succeeded. */
  sterlingRecordId: string | null;
  /** When the partner push first succeeded (used for "Sterling has
   *  your application" alert). Null until it succeeds. */
  sterlingConfirmedAt: Date | null;
}

/** Single grouped query that pulls each application + joins the
 *  partner stage row (when present) + the relevant job and carrier
 *  rows. Ordered by most recent consent first — the dashboard wants
 *  recency over alphabetical. */
export async function getDriverApplicationHistory(
  driverId: string,
): Promise<DriverApplicationRow[]> {
  const rows = await db
    .select({
      applicationId: driverCarrierApplications.id,
      carrierId: driverCarrierApplications.carrierId,
      jobId: driverCarrierApplications.jobId,
      consentedAt: driverCarrierApplications.consentedAt,
      lastQualified: driverCarrierApplications.lastQualified,
      carrierName: carriers.name,
      positionTitle: carrierJobs.positionTitle,
      domicileCity: carrierJobs.domicileCity,
      domicileState: carrierJobs.domicileState,
      equipment: carrierJobs.equipment,
    })
    .from(driverCarrierApplications)
    .innerJoin(
      carriers,
      eq(carriers.id, driverCarrierApplications.carrierId),
    )
    .innerJoin(
      carrierJobs,
      eq(carrierJobs.id, driverCarrierApplications.jobId),
    )
    .where(eq(driverCarrierApplications.driverId, driverId))
    .orderBy(desc(driverCarrierApplications.consentedAt));

  // Partner stages keyed by (driverId, jobId) — separate query so
  // we don't have to think about left-join row multiplication on
  // the main result set. Cheap because the partner_application_stages
  // table is small + indexed on driver_id.
  const stageRows = await db
    .select({
      jobId: partnerApplicationStages.carrierJobId,
      stage: partnerApplicationStages.stage,
      sterlingRecordId: partnerApplicationStages.quickbaseRecordId,
      sterlingConfirmedAt: partnerApplicationStages.quickbasePushSucceededAt,
    })
    .from(partnerApplicationStages)
    .where(eq(partnerApplicationStages.driverId, driverId));

  const stageByJob = new Map<
    string,
    {
      stage: DriverApplicationRow["partnerStage"];
      sterlingRecordId: string | null;
      sterlingConfirmedAt: Date | null;
    }
  >();
  for (const s of stageRows) {
    stageByJob.set(s.jobId, {
      stage: s.stage as DriverApplicationRow["partnerStage"],
      sterlingRecordId: s.sterlingRecordId,
      sterlingConfirmedAt: s.sterlingConfirmedAt,
    });
  }

  return rows.map((r) => {
    const stage = stageByJob.get(r.jobId);
    return {
      applicationId: r.applicationId,
      carrierId: r.carrierId,
      carrierName: r.carrierName,
      jobId: r.jobId,
      positionTitle: r.positionTitle,
      domicileCity: r.domicileCity,
      domicileState: r.domicileState,
      equipment: r.equipment,
      consentedAt: r.consentedAt,
      lastQualified: r.lastQualified,
      partnerStage: stage?.stage ?? null,
      sterlingRecordId: stage?.sterlingRecordId ?? null,
      sterlingConfirmedAt: stage?.sterlingConfirmedAt ?? null,
    };
  });
}

/** Headline counts for the dashboard's "at a glance" strip. */
export interface DriverDashboardStats {
  applicationsTotal: number;
  /** Apps where lastQualified === true. */
  qualifiedCount: number;
  /** Apps where lastQualified === false. The driver was a no-fit. */
  notQualifiedCount: number;
  /** Apps where a partner pipeline confirmed receipt (Sterling). */
  sterlingConfirmedCount: number;
  /** Most recent consent timestamp — anchors the "last applied X ago"
   *  copy. Null when the driver hasn't applied to anything yet. */
  latestApplicationAt: Date | null;
}

export function summarizeApplications(
  rows: DriverApplicationRow[],
): DriverDashboardStats {
  let qualifiedCount = 0;
  let notQualifiedCount = 0;
  let sterlingConfirmedCount = 0;
  let latestApplicationAt: Date | null = null;
  for (const r of rows) {
    if (r.lastQualified === true) qualifiedCount++;
    if (r.lastQualified === false) notQualifiedCount++;
    if (r.sterlingConfirmedAt) sterlingConfirmedCount++;
    if (!latestApplicationAt || r.consentedAt > latestApplicationAt) {
      latestApplicationAt = r.consentedAt;
    }
  }
  return {
    applicationsTotal: rows.length,
    qualifiedCount,
    notQualifiedCount,
    sterlingConfirmedCount,
    latestApplicationAt,
  };
}
