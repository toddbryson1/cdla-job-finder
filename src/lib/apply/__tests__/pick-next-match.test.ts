import { describe, expect, it } from "vitest";
import { pickNextFromMatches } from "@/lib/apply/pick-next-match";
import type { Match } from "@/lib/matching/types";

// Minimal Match fixture — only the fields pickNextFromMatches reads
// matter; the rest get filled with type-safe defaults so we don't drag
// 19 fields into every test case.
function m(overrides: Partial<Match> & { jobId: string }): Match {
  return {
    jobId: overrides.jobId,
    carrierId: overrides.carrierId ?? "00000000-0000-0000-0000-00000000000c",
    carrierName: overrides.carrierName ?? "Test Carrier",
    carrierKind: overrides.carrierKind ?? "partner",
    carrierTier: overrides.carrierTier ?? "none",
    label: overrides.label ?? "Referral Partner",
    positionTitle: overrides.positionTitle ?? "OTR Driver",
    equipment: overrides.equipment ?? "dry-van",
    domicileCity: overrides.domicileCity ?? "Atlanta",
    domicileState: overrides.domicileState ?? "GA",
    distanceMilesFromDriverHome: overrides.distanceMilesFromDriverHome ?? 0,
    payRangeMinWeekly: overrides.payRangeMinWeekly ?? null,
    payRangeMaxWeekly: overrides.payRangeMaxWeekly ?? null,
    payWarning: overrides.payWarning ?? null,
    applicationSurface: overrides.applicationSurface ?? "tenstreet_intelliapp",
    applicationUrl: overrides.applicationUrl ?? null,
    applicationPhone: overrides.applicationPhone ?? null,
    softRankScore: overrides.softRankScore ?? 0,
    fitReasons: overrides.fitReasons ?? [],
    exclusivityWindowEndsAt: overrides.exclusivityWindowEndsAt ?? null,
    verificationStatus: overrides.verificationStatus ?? "verified",
    dataQuality: overrides.dataQuality ?? "complete",
  };
}

describe("pickNextFromMatches", () => {
  it("returns null when the matches list is empty", () => {
    expect(pickNextFromMatches([], "job-x", new Set())).toBeNull();
  });

  it("returns null when the only match IS the current job", () => {
    const matches = [m({ jobId: "job-1" })];
    expect(pickNextFromMatches(matches, "job-1", new Set())).toBeNull();
  });

  it("returns null when every other match is already applied", () => {
    const matches = [
      m({ jobId: "job-1" }),
      m({ jobId: "job-2" }),
      m({ jobId: "job-3" }),
    ];
    const applied = new Set(["job-2", "job-3"]);
    expect(pickNextFromMatches(matches, "job-1", applied)).toBeNull();
  });

  it("returns the first un-applied match, skipping the current job", () => {
    // Matches are pre-ranked by the engine; we trust the ordering and
    // pick the first survivor — that's the highest-ranked unseen one.
    const matches = [
      m({ jobId: "job-1", carrierName: "First" }),
      m({ jobId: "job-2", carrierName: "Second" }),
      m({ jobId: "job-3", carrierName: "Third" }),
    ];
    // Driver is currently at job-1, hasn't applied to anything else.
    const next = pickNextFromMatches(matches, "job-1", new Set());
    expect(next?.jobId).toBe("job-2");
    expect(next?.carrierName).toBe("Second");
  });

  it("skips already-applied matches even when current is mid-list", () => {
    // Helper returns the BEST remaining option, not "the next after
    // current in list order." If job-1 ranks higher than current
    // (job-2) and the driver hasn't tried it yet, that's the suggestion.
    const matches = [
      m({ jobId: "job-1", carrierName: "Higher rank, untried" }),
      m({ jobId: "job-2" }), // current
      m({ jobId: "job-3" }), // already applied
      m({ jobId: "job-4" }),
    ];
    const next = pickNextFromMatches(matches, "job-2", new Set(["job-3"]));
    expect(next?.jobId).toBe("job-1");
    expect(next?.carrierName).toBe("Higher rank, untried");
  });

  it("walks past both current and applied to find a survivor", () => {
    const matches = [
      m({ jobId: "applied-1" }),
      m({ jobId: "current" }),
      m({ jobId: "applied-2" }),
      m({ jobId: "survivor", carrierName: "Found it" }),
    ];
    const next = pickNextFromMatches(
      matches,
      "current",
      new Set(["applied-1", "applied-2"]),
    );
    expect(next?.jobId).toBe("survivor");
  });

  it("returned shape carries just the fields the result page renders", () => {
    const matches = [
      m({
        jobId: "job-1",
      }),
      m({
        jobId: "job-2",
        carrierName: "C.R. England",
        positionTitle: "Solo OTR Dry Van",
        domicileCity: "Salt Lake City",
        domicileState: "UT",
        payRangeMinWeekly: 1200,
        // Pay fields not in the suggestion shape — verifies the helper
        // doesn't accidentally leak the whole Match into the prop.
      }),
    ];
    const next = pickNextFromMatches(matches, "job-1", new Set());
    expect(next).toEqual({
      jobId: "job-2",
      carrierName: "C.R. England",
      positionTitle: "Solo OTR Dry Van",
      domicileCity: "Salt Lake City",
      domicileState: "UT",
    });
  });

  it("preserves engine-given ordering — never re-sorts", () => {
    // Engine might rank a partner with worse pay above a prospect with
    // better pay (tier wins ties). The helper has no opinion on
    // ranking; it just walks in order. Pin that contract.
    const matches = [
      m({ jobId: "tier1-low-pay", carrierTier: "tier_1", softRankScore: 1 }),
      m({ jobId: "tier2-high-pay", carrierTier: "none", softRankScore: 10 }),
    ];
    const next = pickNextFromMatches(matches, "different-job", new Set());
    expect(next?.jobId).toBe("tier1-low-pay");
  });
});
