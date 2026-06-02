// Backoff schedule for the QuickBase retry sweeper. Pure helpers —
// no DB, no fetch — so the math gets unit-tested without the
// integration suite.
//
// Per spec §B6.3 (Anderson handoff addendum), 5xx + network failures
// queue with exponential-ish backoff:
//
//   attempt 1 → 5 minutes
//   attempt 2 → 30 minutes
//   attempt 3 → 2 hours
//   attempt 4 → 12 hours
//   attempt 5 → 24 hours
//   attempt 6+ → null (terminal — sweeper flips stage to
//                       submit_failed_validation with reason
//                       "max retries exhausted")
//
// The "attempt" counter here is the count of failures BEFORE this
// retry. So attempt=1 means the row failed once and is awaiting its
// first retry (5min after the first failure). attempt=0 is never
// queued — the handler does the initial push synchronously.

/**
 * Backoff intervals in milliseconds. Index = attempt number (1-based).
 * Index 0 is unused — attempts start at 1 (the handler does the
 * initial push synchronously before queueing).
 */
const BACKOFF_MS: number[] = [
  0, // attempt 0 — never queued
  5 * 60 * 1000, // attempt 1 → 5 min
  30 * 60 * 1000, // attempt 2 → 30 min
  2 * 60 * 60 * 1000, // attempt 3 → 2 hr
  12 * 60 * 60 * 1000, // attempt 4 → 12 hr
  24 * 60 * 60 * 1000, // attempt 5 → 24 hr
];

export const MAX_RETRY_ATTEMPTS = BACKOFF_MS.length - 1; // 5

/**
 * Time in milliseconds to wait before the next retry, given how many
 * failed attempts the row already has. Returns null when the row has
 * exhausted the retry budget — caller should flip stage to
 * submit_failed_validation with a "max retries exhausted" reason.
 *
 * @param attempts how many failures the row has accumulated AFTER the
 *                 most recent push attempt. Always >= 1 (a row only
 *                 queues for retry after at least one failure).
 */
export function nextRetryDelayMs(attempts: number): number | null {
  if (!Number.isFinite(attempts) || attempts < 1) return null;
  if (attempts > MAX_RETRY_ATTEMPTS) return null;
  return BACKOFF_MS[attempts]!;
}

/**
 * Convenience — compute the wall-clock time of the next retry, given
 * the current attempt count and the reference time (default: now).
 * Returns null when the row has exhausted retries.
 */
export function nextRetryAt(
  attempts: number,
  now: Date = new Date(),
): Date | null {
  const delay = nextRetryDelayMs(attempts);
  if (delay == null) return null;
  return new Date(now.getTime() + delay);
}

/**
 * Whether a row has run out the retry budget. Sweeper uses this to
 * decide between "requeue with a fresh next_retry_at" and "flip to
 * submit_failed_validation."
 */
export function isMaxRetriesExhausted(attempts: number): boolean {
  return attempts > MAX_RETRY_ATTEMPTS;
}
