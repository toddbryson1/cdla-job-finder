import { describe, expect, it } from "vitest";
import { bucketsForCount, type DailyCount } from "../select";

describe("bucketsForCount — Section 3.3 sequencer", () => {
  it("count=4 always covers all buckets, cursor ignored", () => {
    for (let cursor = 0; cursor < 10; cursor++) {
      expect(bucketsForCount(4, cursor)).toEqual([1, 2, 3, 4]);
    }
  });

  it("count=1 rotates one bucket per day across a 4-day cycle", () => {
    expect(bucketsForCount(1, 0)).toEqual([1]);
    expect(bucketsForCount(1, 1)).toEqual([2]);
    expect(bucketsForCount(1, 2)).toEqual([3]);
    expect(bucketsForCount(1, 3)).toEqual([4]);
    expect(bucketsForCount(1, 4)).toEqual([1]); // wraps
    expect(bucketsForCount(1, 7)).toEqual([4]);
  });

  it("count=2 alternates [B1,B3] and [B2,B4]", () => {
    expect(bucketsForCount(2, 0)).toEqual([1, 3]);
    expect(bucketsForCount(2, 1)).toEqual([2, 4]);
    expect(bucketsForCount(2, 2)).toEqual([1, 3]);
    expect(bucketsForCount(2, 3)).toEqual([2, 4]);
  });

  it("count=3 rotates which bucket is skipped", () => {
    expect(bucketsForCount(3, 0)).toEqual([2, 3, 4]); // skip B1
    expect(bucketsForCount(3, 1)).toEqual([1, 3, 4]); // skip B2
    expect(bucketsForCount(3, 2)).toEqual([1, 2, 4]); // skip B3
    expect(bucketsForCount(3, 3)).toEqual([1, 2, 3]); // skip B4
    expect(bucketsForCount(3, 4)).toEqual([2, 3, 4]); // wraps
  });

  it("over a 4-day window, count=1 covers every bucket exactly once", () => {
    const seen = new Set<number>();
    for (let day = 0; day < 4; day++) {
      bucketsForCount(1, day).forEach((b) => seen.add(b));
    }
    expect([...seen].sort()).toEqual([1, 2, 3, 4]);
  });

  it("over a 4-day window, count=3 covers every bucket exactly 3 times", () => {
    const counts = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
      [4, 0],
    ]);
    for (let day = 0; day < 4; day++) {
      bucketsForCount(3, day).forEach((b) => counts.set(b, counts.get(b)! + 1));
    }
    for (const c of counts.values()) expect(c).toBe(3);
  });

  it("typeguard: all counts return valid Bucket arrays (length matches count)", () => {
    for (const count of [1, 2, 3, 4] as DailyCount[]) {
      for (let cursor = 0; cursor < 8; cursor++) {
        const result = bucketsForCount(count, cursor);
        expect(result).toHaveLength(count);
        for (const b of result) expect([1, 2, 3, 4]).toContain(b);
      }
    }
  });
});
