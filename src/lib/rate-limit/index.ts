// Postgres-backed fixed-window rate limiter.
//
// Why Postgres and not in-memory: the app runs on Vercel serverless, so
// process memory is per-lambda and short-lived — an in-memory counter
// can't throttle an attacker who lands on a fresh instance each request.
// The DB is the only shared, durable store we have. See schema.ts
// (rate_limit_counters) + migration 0034.
//
// Algorithm: fixed window. `windowStart` is now() floored to the window
// size; a single atomic upsert increments the (bucket, windowStart)
// counter and returns the running total, so the check is one round-trip
// with no read-modify-write race. Fixed windows allow a burst at the
// boundary (up to 2x the limit across two adjacent windows) — acceptable
// for the abuse vectors here (email bombing, lead spam), and far simpler
// than a sliding log.
//
// Failure policy: FAIL OPEN. If the DB errors, we allow the request and
// log. A throttle that takes down login/lead capture when Postgres
// hiccups is worse than briefly losing the throttle. The honeypot, Zod
// validation, and Stytch's own abuse controls remain as other layers.

import { lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";

export interface RateLimitRule {
  /** Namespaces the limit + subject, e.g. `login_email:foo@bar.com`. */
  bucket: string;
  /** Max hits allowed within the window. */
  limit: number;
  /** Window length in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Hits remaining in the current window (0 when blocked). */
  remaining: number;
  /** Seconds until the current window resets — for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Record one hit against `bucket` and report whether it's within `limit`
 * for the current window. Atomic (single upsert). Fails open on DB error.
 */
export async function checkRateLimit(
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const windowMs = rule.windowSeconds * 1000;
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((windowStartMs + windowMs - now) / 1000),
  );

  try {
    const rows = await db
      .insert(rateLimitCounters)
      .values({ bucket: rule.bucket, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitCounters.bucket, rateLimitCounters.windowStart],
        set: { count: sql`${rateLimitCounters.count} + 1` },
      })
      .returning({ count: rateLimitCounters.count });

    const count = rows[0]?.count ?? 1;
    const allowed = count <= rule.limit;
    return {
      allowed,
      remaining: Math.max(0, rule.limit - count),
      retryAfterSeconds,
    };
  } catch (err) {
    // Fail open — see file header.
    console.error(
      "[rate-limit] check failed, allowing (fail-open):",
      err instanceof Error ? err.message : String(err),
    );
    return { allowed: true, remaining: rule.limit, retryAfterSeconds };
  }
}

/**
 * Check several rules in one call. Every rule is recorded (so each
 * counter advances), and the request is blocked if ANY rule is over its
 * limit. Returns the most urgent block (largest retryAfter) when blocked.
 * Use for "per-IP AND per-email" gating.
 */
export async function checkRateLimits(
  rules: RateLimitRule[],
): Promise<RateLimitResult> {
  const results = await Promise.all(rules.map(checkRateLimit));
  const blocked = results.filter((r) => !r.allowed);
  if (blocked.length > 0) {
    blocked.sort((a, b) => b.retryAfterSeconds - a.retryAfterSeconds);
    return blocked[0];
  }
  // Allowed: report the tightest remaining headroom.
  results.sort((a, b) => a.remaining - b.remaining);
  return results[0] ?? { allowed: true, remaining: 0, retryAfterSeconds: 1 };
}

/**
 * Best-effort IP extraction for serverless. Vercel sets x-forwarded-for
 * (client is the first entry); x-real-ip is a fallback. Returns "unknown"
 * when neither is present so callers always get a usable bucket subject.
 */
export function clientIpFrom(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Prune counter rows whose window ended more than `olderThanSeconds` ago.
 * Called from the daily cron. Default keeps 24h of windows.
 */
export async function cleanupRateLimitCounters(
  olderThanSeconds = 24 * 60 * 60,
): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const rows = await db
    .delete(rateLimitCounters)
    .where(lt(rateLimitCounters.windowStart, cutoff))
    .returning({ bucket: rateLimitCounters.bucket });
  return { deleted: rows.length };
}
