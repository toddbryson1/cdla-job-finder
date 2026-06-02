// QuickBase retry sweeper for Anderson handoff stage rows.
//
// Picks up partner_application_stages rows where stage =
// 'submit_queued_for_retry' and quickbase_next_retry_at <= now, calls
// pushAndersonHandoff() for each, and transitions the stage based on
// the outcome — same semantics as the inline handler in
// src/app/match/[…]/apply/actions.ts, just driven by the scheduler
// instead of a page render.
//
// Why both: the inline handler catches the common case (driver re-
// loads the result page within the backoff window), this sweeper
// catches the rest (driver leaves, retry comes due later, nothing
// triggers a render). Spec §B6.3 backoff: 5min/30min/2h/12h/24h.

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import { pushAndersonHandoff, isQuickbaseConfigured } from "./client";
import {
  isMaxRetriesExhausted,
  nextRetryAt,
} from "./retry-schedule";

const DEFAULT_BATCH_SIZE = 50;

export interface QbRetrySweepResult {
  /** Total rows the sweeper picked up. */
  attempted: number;
  /** Pushed to QB and got a 2xx. */
  succeeded: number;
  /** Hit a 4xx / auth — flipped to submit_failed_validation. */
  failedValidation: number;
  /** Hit another 5xx / network — re-queued with the next backoff. */
  requeued: number;
  /** Exhausted retry budget — flipped to submit_failed_validation. */
  exhausted: number;
  /** QB push is gated off (feature flag) — no-op (rows stay queued). */
  skippedFlagOff: boolean;
}

export async function runQbRetrySweeper(options?: {
  batchSize?: number;
  /** Override for tests — defaults to new Date() at call time. */
  now?: Date;
}): Promise<QbRetrySweepResult> {
  const batchSize = options?.batchSize ?? DEFAULT_BATCH_SIZE;
  const now = options?.now ?? new Date();

  const result: QbRetrySweepResult = {
    attempted: 0,
    succeeded: 0,
    failedValidation: 0,
    requeued: 0,
    exhausted: 0,
    skippedFlagOff: false,
  };

  if (!isQuickbaseConfigured()) {
    // Flag stays off until counsel clears spec §B11. Sweeper does
    // nothing — the queued rows wait. Important: we DON'T flip the
    // stage to something terminal here; the rows are well-formed,
    // we just can't push yet.
    result.skippedFlagOff = true;
    return result;
  }

  // Fetch a bounded batch of due rows. Joins the driver + job +
  // carrier so the push payload has everything it needs without
  // N+1 queries.
  const rows = await db
    .select({
      stageRow: partnerApplicationStages,
      driver: drivers,
      carrierJob: carrierJobs,
      carrier: carriers,
    })
    .from(partnerApplicationStages)
    .innerJoin(drivers, eq(partnerApplicationStages.driverId, drivers.id))
    .innerJoin(
      carrierJobs,
      eq(partnerApplicationStages.carrierJobId, carrierJobs.id),
    )
    .innerJoin(carriers, eq(partnerApplicationStages.carrierId, carriers.id))
    .where(
      and(
        eq(partnerApplicationStages.stage, "submit_queued_for_retry"),
        lte(partnerApplicationStages.quickbaseNextRetryAt, now),
      ),
    )
    .orderBy(asc(partnerApplicationStages.quickbaseNextRetryAt))
    .limit(batchSize);

  result.attempted = rows.length;

  for (const r of rows) {
    // Defensively read the carrier handoff config. A row queued
    // under one config shouldn't be re-pushed under a different
    // one (carrier deactivated, config rotated, etc.) — verify
    // before fetch.
    const cfg = (r.carrier.partnerHandoffConfig ?? null) as Record<
      string,
      unknown
    > | null;
    if (!cfg || cfg.handoff_type !== "anderson_quickbase") {
      // Carrier config drifted. Flip to failed_validation with a
      // clear reason so an operator can investigate; otherwise the
      // row would loop forever.
      await db
        .update(partnerApplicationStages)
        .set({
          stage: "submit_failed_validation",
          quickbaseLastError:
            "Carrier handoff config no longer routes to anderson_quickbase",
          quickbaseNextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerApplicationStages.id, r.stageRow.id));
      result.failedValidation++;
      continue;
    }

    const qbCfg = cfg.quickbase as
      | {
          realm_hostname: string;
          app_id: string;
          table_id: string;
          default_recruiter_name: string;
        }
      | undefined;
    if (
      !qbCfg ||
      typeof qbCfg.realm_hostname !== "string" ||
      typeof qbCfg.app_id !== "string" ||
      typeof qbCfg.table_id !== "string"
    ) {
      await db
        .update(partnerApplicationStages)
        .set({
          stage: "submit_failed_validation",
          quickbaseLastError: "Carrier quickbase config malformed",
          quickbaseNextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerApplicationStages.id, r.stageRow.id));
      result.failedValidation++;
      continue;
    }

    const attemptedAt = new Date();
    const pushResult = await pushAndersonHandoff({
      driver: r.driver,
      carrierJob: r.carrierJob,
      stage: r.stageRow,
      quickbaseConfig: {
        realm_hostname: qbCfg.realm_hostname,
        app_id: qbCfg.app_id,
        table_id: qbCfg.table_id,
        default_recruiter_name:
          typeof qbCfg.default_recruiter_name === "string"
            ? qbCfg.default_recruiter_name
            : "Todd Bryson",
      },
    });

    if (pushResult.ok) {
      await db
        .update(partnerApplicationStages)
        .set({
          stage: "submitted_to_sterling",
          quickbaseRecordId: pushResult.recordId,
          quickbasePushAttemptedAt: attemptedAt,
          quickbasePushSucceededAt: new Date(),
          quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
          quickbaseLastError: null,
          quickbaseNextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerApplicationStages.id, r.stageRow.id));
      result.succeeded++;
      continue;
    }

    // Failure paths. 4xx + auth → terminal failure (no retry per
    // spec §B6.3). 5xx + network → another retry IF budget remains.
    const nextAttempts = r.stageRow.quickbasePushAttempts + 1;
    const isTerminalFailureCode =
      pushResult.code === "no_retry" || pushResult.code === "auth";
    const exhausted = isMaxRetriesExhausted(nextAttempts);

    if (isTerminalFailureCode || exhausted) {
      const reasonSuffix = exhausted
        ? " (max retries exhausted)"
        : "";
      await db
        .update(partnerApplicationStages)
        .set({
          stage: "submit_failed_validation",
          quickbasePushAttemptedAt: attemptedAt,
          quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
          quickbaseLastError: pushResult.error + reasonSuffix,
          quickbaseNextRetryAt: null,
          updatedAt: new Date(),
        })
        .where(eq(partnerApplicationStages.id, r.stageRow.id));
      if (exhausted) result.exhausted++;
      else result.failedValidation++;
      continue;
    }

    // Re-queue with the next backoff window.
    const nextAt = nextRetryAt(nextAttempts, new Date());
    await db
      .update(partnerApplicationStages)
      .set({
        // Stage stays as submit_queued_for_retry; only the schedule
        // moves forward.
        quickbasePushAttemptedAt: attemptedAt,
        quickbasePushAttempts: sql`${partnerApplicationStages.quickbasePushAttempts} + 1`,
        quickbaseLastError: pushResult.error,
        quickbaseNextRetryAt: nextAt,
        updatedAt: new Date(),
      })
      .where(eq(partnerApplicationStages.id, r.stageRow.id));
    result.requeued++;
  }

  return result;
}
