import { describe, expect, it } from "vitest";
import {
  isMaxRetriesExhausted,
  MAX_RETRY_ATTEMPTS,
  nextRetryAt,
  nextRetryDelayMs,
} from "@/lib/quickbase/retry-schedule";

describe("nextRetryDelayMs — spec §B6.3 backoff schedule", () => {
  // These intervals are spec-locked. A future tweak (e.g. doubling
  // the early retries) needs to come through this test so the
  // codepath that consumes them gets re-validated.
  it("attempt 1 → 5 minutes", () => {
    expect(nextRetryDelayMs(1)).toBe(5 * 60 * 1000);
  });
  it("attempt 2 → 30 minutes", () => {
    expect(nextRetryDelayMs(2)).toBe(30 * 60 * 1000);
  });
  it("attempt 3 → 2 hours", () => {
    expect(nextRetryDelayMs(3)).toBe(2 * 60 * 60 * 1000);
  });
  it("attempt 4 → 12 hours", () => {
    expect(nextRetryDelayMs(4)).toBe(12 * 60 * 60 * 1000);
  });
  it("attempt 5 → 24 hours", () => {
    expect(nextRetryDelayMs(5)).toBe(24 * 60 * 60 * 1000);
  });

  it("attempt 6 returns null (exhausted)", () => {
    expect(nextRetryDelayMs(6)).toBeNull();
  });

  it("MAX_RETRY_ATTEMPTS matches the schedule length", () => {
    // Documents the invariant — if a future spec change adds a 6th
    // entry, this catches the unsync.
    expect(MAX_RETRY_ATTEMPTS).toBe(5);
  });

  it("attempt 0 returns null (handler does the initial push synchronously, not via retry queue)", () => {
    expect(nextRetryDelayMs(0)).toBeNull();
  });

  it("negative / NaN attempts return null defensively", () => {
    expect(nextRetryDelayMs(-1)).toBeNull();
    expect(nextRetryDelayMs(Number.NaN)).toBeNull();
    expect(nextRetryDelayMs(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("nextRetryAt", () => {
  it("adds the delay to the reference time for attempt 1", () => {
    const now = new Date("2026-06-02T00:00:00Z");
    const result = nextRetryAt(1, now);
    expect(result).not.toBeNull();
    expect(result!.getTime() - now.getTime()).toBe(5 * 60 * 1000);
  });

  it("uses Date.now() when no reference is passed", () => {
    const before = Date.now();
    const result = nextRetryAt(2);
    const after = Date.now();
    expect(result).not.toBeNull();
    expect(result!.getTime()).toBeGreaterThanOrEqual(before + 30 * 60 * 1000);
    expect(result!.getTime()).toBeLessThanOrEqual(after + 30 * 60 * 1000);
  });

  it("returns null when attempts exhausted (callsite flips stage)", () => {
    expect(nextRetryAt(99)).toBeNull();
  });
});

describe("isMaxRetriesExhausted", () => {
  it("false for attempts within the schedule", () => {
    expect(isMaxRetriesExhausted(1)).toBe(false);
    expect(isMaxRetriesExhausted(3)).toBe(false);
    expect(isMaxRetriesExhausted(5)).toBe(false);
  });
  it("true for attempts past the schedule", () => {
    expect(isMaxRetriesExhausted(6)).toBe(true);
    expect(isMaxRetriesExhausted(99)).toBe(true);
  });
});
