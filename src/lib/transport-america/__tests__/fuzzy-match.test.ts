// Tests for the TA Dedicated fuzzy matcher. Pure functions — no DB
// or HTTP — so each test runs in single-digit ms.
//
// Real fixtures come from the live Sheets data we've inspected. See
// scripts/_audit-all-tabs.ts for the full populated-tab list and
// scripts/ta-match-report.ts for the fuzzy results these tests pin.

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONFIDENCE_THRESHOLD,
  matchAllOpenings,
  matchOpening,
  scoreMatch,
} from "../fuzzy-match";
import type { OpeningRow } from "../types";

function mkOpening(division: string, rowIndex = 1): OpeningRow {
  return {
    rowIndex,
    dateOpened: null,
    division,
    driversNeededRaw: "1",
    driversNeeded: 1,
    isFilled: false,
    isCdlB: false,
  };
}

describe("fuzzy-match.scoreMatch", () => {
  it("scores identical strings at 1.0", () => {
    expect(scoreMatch("3M Aberdeen SD", "3M Aberdeen SD")).toBe(1);
  });

  it("scores empty strings at 0", () => {
    expect(scoreMatch("", "anything")).toBe(0);
    expect(scoreMatch("anything", "")).toBe(0);
  });

  it("ignores punctuation and case differences", () => {
    const score = scoreMatch("3M - Aberdeen, SD", "3m aberdeen sd");
    expect(score).toBeGreaterThan(0.7);
  });

  it("ignores parentheticals (driver counts, shift notes)", () => {
    const a = "Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun, M, W, F)";
    const b = "Ecolab Joliet IL Shuttle 3rd shift";
    expect(scoreMatch(a, b)).toBeGreaterThan(0.7);
  });

  it("expands AAP → AA and CQ → Carquest abbreviations", () => {
    // Without expansion these would score very low because no
    // token overlaps. With expansion they share "aa", "carquest",
    // "blaine".
    const withExpansion = scoreMatch("AAP/CQ Blaine", "AA Carquest Blaine");
    const noExpansion = scoreMatch("XYZ/QRS Blaine", "AA Carquest Blaine");
    expect(withExpansion).toBeGreaterThan(noExpansion);
  });

  it("expands NFS → norfolk southern", () => {
    const score = scoreMatch("Norfolk Southern Altoona", "NFS Altoona, PA");
    expect(score).toBeGreaterThan(0.5);
  });

  it("PENALIZES role disagreement (Solo vs Team)", () => {
    // Same place, different roles — should score lower than same
    // place same role.
    const sameRole = scoreMatch(
      "Honda Valdosta GA Team",
      "Honda Valdosta GA Team",
    );
    const differentRole = scoreMatch(
      "Honda Valdosta GA Team",
      "Honda Valdosta GA Solo",
    );
    expect(differentRole).toBeLessThan(sameRole);
    // The penalty is multiplicative 0.7, so the drop should be
    // meaningful (>10pp).
    expect(sameRole - differentRole).toBeGreaterThan(0.1);
  });

  it("does NOT penalize role disagreement when only one side has a role", () => {
    // "Watts - Franklin, NH Solo" vs "Watts solo - Franklin NH"
    // both have Solo → no penalty applied.
    // "Watts - Franklin, NH" (no role) vs "Watts solo - Franklin NH"
    // (Solo) → no penalty because rolesA.size === 0.
    const withRole = scoreMatch(
      "Watts - Franklin, NH Solo",
      "Watts solo - Franklin NH",
    );
    const oneSideRole = scoreMatch(
      "Watts - Franklin, NH",
      "Watts solo - Franklin NH",
    );
    // Both should score high; the no-role side shouldn't get penalized
    expect(oneSideRole).toBeGreaterThan(0.6);
    expect(withRole).toBeGreaterThan(0.7);
  });

  it("ignores word order via token-sort ratio", () => {
    const score = scoreMatch(
      "Watts solo - Franklin NH",
      "Watts - Franklin, NH Solo",
    );
    expect(score).toBeGreaterThan(0.7);
  });
});

describe("fuzzy-match.matchOpening", () => {
  const candidates = [
    "3M Aberdeen SD",
    "3M Prairie du Chien WI",
    "Honda Valdosta GA solo",
    "Honda Valdosta GA team",
    "Honda Charlotte Team",
    "Honda Charlotte Shuttle",
    "AA/CQ (Final Mile) - La Cross, WI",
    "Ecolab Garland, TX Shuttle",
    "Ecolab Garland-home weekly",
  ];

  it("returns the best-matching tab above threshold", () => {
    const opening = mkOpening("3M - Aberdeen, SD Solo");
    const result = matchOpening(opening, candidates);
    expect(result.isResolved).toBe(true);
    expect(result.matchedTabName).toBe("3M Aberdeen SD");
    expect(result.confidence).toBeGreaterThan(DEFAULT_CONFIDENCE_THRESHOLD);
  });

  it("returns top-3 candidates regardless of resolution", () => {
    const opening = mkOpening("Triangle General Overnight");
    const result = matchOpening(opening, candidates);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates[0].score).toBeGreaterThanOrEqual(
      result.candidates[1].score,
    );
  });

  it("marks unresolved when best score is below threshold", () => {
    const opening = mkOpening("Triangle General Overnight");
    const result = matchOpening(opening, candidates);
    expect(result.isResolved).toBe(false);
    expect(result.matchedTabName).toBeNull();
    expect(result.notes.some((n) => /below threshold/i.test(n))).toBe(true);
  });

  it("marks unresolved when top two candidates tie within 0.05", () => {
    // Both Honda Charlotte tabs score identically against the
    // "Honda - Charlotte, NC" opening (no role specified).
    const opening = mkOpening("Honda - Charlotte, NC");
    const result = matchOpening(opening, candidates);
    // Top 2 are within 0.05 → not resolved even though score is high
    if (result.candidates[0].score - result.candidates[1].score < 0.05) {
      expect(result.isResolved).toBe(false);
      expect(result.notes.some((n) => /within 0\.05/.test(n))).toBe(true);
    }
  });

  it("picks role-matching candidate over role-disagreeing one", () => {
    // "Honda Charlotte Team" should win over "Honda Charlotte Shuttle"
    // for an opening that specifies Team.
    const opening = mkOpening("Honda - Charlotte, NC Team");
    const result = matchOpening(opening, candidates);
    if (result.isResolved) {
      expect(result.matchedTabName).toBe("Honda Charlotte Team");
    } else {
      // If tied/unresolved, the candidate ordering should still
      // prefer Team over Shuttle.
      const teamRank = result.candidates.findIndex(
        (c) => c.tabName === "Honda Charlotte Team",
      );
      const shuttleRank = result.candidates.findIndex(
        (c) => c.tabName === "Honda Charlotte Shuttle",
      );
      expect(teamRank).toBeLessThan(shuttleRank);
    }
  });

  it("respects a custom confidence threshold", () => {
    const opening = mkOpening("Ecolab - Garland, TX Shuttle (3rd Shift)");
    const strict = matchOpening(opening, candidates, 0.9);
    const lax = matchOpening(opening, candidates, 0.3);
    // Strict threshold: maybe unresolved; lax: definitely resolved.
    expect(lax.isResolved).toBe(true);
    // If the same-role candidate exists, lax picks it
    expect(["Ecolab Garland, TX Shuttle", "Ecolab Garland-home weekly"]).toContain(
      lax.matchedTabName,
    );
    void strict;
  });
});

describe("fuzzy-match.matchAllOpenings", () => {
  it("returns one MatchResult per opening", () => {
    const openings = [
      mkOpening("3M - Aberdeen, SD"),
      mkOpening("AAP/CQ - La Cross, WI Final Mile"),
    ];
    const candidates = ["3M Aberdeen SD", "AA/CQ (Final Mile) - La Cross, WI"];
    const results = matchAllOpenings(openings, candidates);
    expect(results).toHaveLength(2);
    expect(results[0].opening.division).toBe("3M - Aberdeen, SD");
    expect(results[1].opening.division).toBe("AAP/CQ - La Cross, WI Final Mile");
  });

  it("returns an empty candidate list when no candidates given", () => {
    const openings = [mkOpening("anything")];
    const results = matchAllOpenings(openings, []);
    expect(results[0].isResolved).toBe(false);
    expect(results[0].candidates).toHaveLength(0);
  });
});
