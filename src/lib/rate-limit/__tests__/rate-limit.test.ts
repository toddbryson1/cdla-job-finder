// DB-backed tests for the fixed-window rate limiter. These hit real
// Postgres via DATABASE_URL (same convention as funnel-events.test.ts),
// so they only run where a database is reachable.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { like } from "drizzle-orm";
import { db } from "@/db/client";
import { rateLimitCounters } from "@/db/schema";
import {
  checkRateLimit,
  checkRateLimits,
  cleanupRateLimitCounters,
  clientIpFrom,
} from "@/lib/rate-limit";

// All test buckets share this prefix so cleanup is precise and never
// touches real traffic counters.
const PREFIX = "test_ratelimit_";

async function cleanup(): Promise<void> {
  await db
    .delete(rateLimitCounters)
    .where(like(rateLimitCounters.bucket, `${PREFIX}%`));
}

beforeEach(cleanup);
afterEach(cleanup);

describe("checkRateLimit", () => {
  it("allows up to the limit, then blocks", async () => {
    const bucket = `${PREFIX}single`;
    const rule = { bucket, limit: 3, windowSeconds: 3600 };

    const r1 = await checkRateLimit(rule);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    await checkRateLimit(rule); // 2nd
    const r3 = await checkRateLimit(rule); // 3rd — still within limit
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    const r4 = await checkRateLimit(rule); // 4th — over
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isolates distinct buckets", async () => {
    const a = { bucket: `${PREFIX}a`, limit: 1, windowSeconds: 3600 };
    const b = { bucket: `${PREFIX}b`, limit: 1, windowSeconds: 3600 };

    expect((await checkRateLimit(a)).allowed).toBe(true);
    expect((await checkRateLimit(a)).allowed).toBe(false); // a exhausted
    expect((await checkRateLimit(b)).allowed).toBe(true); // b untouched
  });
});

describe("checkRateLimits", () => {
  it("blocks when ANY rule is over its limit", async () => {
    const ipRule = { bucket: `${PREFIX}ip`, limit: 5, windowSeconds: 3600 };
    const emailRule = {
      bucket: `${PREFIX}email`,
      limit: 1,
      windowSeconds: 3600,
    };

    const first = await checkRateLimits([ipRule, emailRule]);
    expect(first.allowed).toBe(true);

    // Second call: ip rule still has headroom, but email rule is now over.
    const second = await checkRateLimits([ipRule, emailRule]);
    expect(second.allowed).toBe(false);
  });
});

describe("cleanupRateLimitCounters", () => {
  it("deletes windows older than the cutoff and keeps recent ones", async () => {
    const bucket = `${PREFIX}prune`;
    // A current-window hit (should survive a 24h-cutoff prune).
    await checkRateLimit({ bucket, limit: 10, windowSeconds: 3600 });

    // An ancient window inserted directly.
    await db.insert(rateLimitCounters).values({
      bucket: `${PREFIX}old`,
      windowStart: new Date(Date.now() - 48 * 60 * 60 * 1000),
      count: 1,
    });

    const { deleted } = await cleanupRateLimitCounters(24 * 60 * 60);
    expect(deleted).toBeGreaterThanOrEqual(1);

    const remaining = await db
      .select({ bucket: rateLimitCounters.bucket })
      .from(rateLimitCounters)
      .where(like(rateLimitCounters.bucket, `${PREFIX}%`));
    const buckets = remaining.map((r) => r.bucket);
    expect(buckets).toContain(bucket);
    expect(buckets).not.toContain(`${PREFIX}old`);
  });
});

describe("clientIpFrom", () => {
  it("prefers the first x-forwarded-for entry", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIpFrom(h)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip, then 'unknown'", () => {
    expect(clientIpFrom(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe(
      "9.9.9.9",
    );
    expect(clientIpFrom(new Headers())).toBe("unknown");
  });
});
