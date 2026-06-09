import { describe, expect, it } from "vitest";
import {
  fitTierScore,
  parseFitTierProfile,
} from "@/lib/matching/fitTier";

// The fit-tier scorer is the engine's "a carrier can be a match AND the
// wrong call" logic. The single most important property: it NEVER invents
// a boundary. A null/empty/malformed profile is neutral.

describe("parseFitTierProfile", () => {
  it("returns null for null / non-object / empty input", () => {
    expect(parseFitTierProfile(null)).toBeNull();
    expect(parseFitTierProfile(undefined)).toBeNull();
    expect(parseFitTierProfile("nope")).toBeNull();
    expect(parseFitTierProfile({})).toBeNull();
  });

  it("ignores malformed sub-fields rather than guessing", () => {
    // experience present but all fields wrong types → dropped → null
    expect(
      parseFitTierProfile({ experience: { strongMinMonths: "3" } }),
    ).toBeNull();
    // an unknown 'favors' value is dropped
    expect(parseFitTierProfile({ wants: { favors: "vibes" } })).toBeNull();
  });

  it("parses a well-formed profile", () => {
    const p = parseFitTierProfile({
      experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
      wants: { favors: "home_time" },
    });
    expect(p).toEqual({
      experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
      wants: { favors: "home_time" },
    });
  });
});

describe("fitTierScore", () => {
  const england = {
    experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
  };

  it("is strictly neutral with no profile (never fabricates a boundary)", () => {
    const r = fitTierScore(null, 6, "pay");
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it("rewards a driver inside the strong-fit experience band", () => {
    const r = fitTierScore(england, 6, null); // 6 months
    expect(r.score).toBeGreaterThan(0);
    expect(r.reasons.join(" ")).toMatch(/on-ramp/i);
  });

  it("demotes (with a neutral reason) a driver past the fade boundary", () => {
    const r = fitTierScore(england, 36, null); // 3 years
    expect(r.score).toBeLessThan(0);
    // Neutral, factual — about FIT, not a knock on the carrier.
    expect(r.reasons.join(" ")).toMatch(/pay more/i);
    expect(r.reasons.join(" ")).not.toMatch(/bad|worse|avoid|don't/i);
  });

  it("is neutral between the strong band and the fade boundary", () => {
    const r = fitTierScore(england, 18, null); // past strong, before fade
    expect(r.score).toBe(0);
  });

  it("never asserts a fade when no fadesAfterMonths boundary is set", () => {
    const noFade = { experience: { strongMinMonths: 3, strongMaxMonths: 12 } };
    const r = fitTierScore(noFade, 120, null); // very senior, but no boundary
    expect(r.score).toBe(0);
    expect(r.reasons).toEqual([]);
  });

  it("rewards a carrier whose strength matches the driver's #1 priority", () => {
    const swift = { wants: { favors: "home_time" as const } };
    const homeFirst = fitTierScore(swift, 24, "home_time");
    const payFirst = fitTierScore(swift, 24, "pay");
    expect(homeFirst.score).toBeGreaterThan(payFirst.score);
    expect(homeFirst.reasons.join(" ")).toMatch(/home time/i);
  });
});
