// Tests for the build-carrier-job helpers. The main buildCarrierJobRow
// is integration (needs zip_codes geocode); tested via the full sync
// run against prod. These tests cover the pure helpers, which is
// where the subtle regressions show up.

import { describe, expect, it } from "vitest";
import {
  deriveEquipmentSlug,
  deriveHomeTimeArray,
  divisionHash,
  normalizeDivisionForKey,
  parseCityStateFromDivision,
} from "../build-carrier-job";

describe("build-carrier-job.parseCityStateFromDivision", () => {
  it.each([
    ["3M - Aberdeen, SD Solo", "Aberdeen", "SD"],
    ["AAP/CQ - Blaine, MN Flex", "Blaine", "MN"],
    ["Honda - Charlotte, NC Team", "Charlotte", "NC"],
    ["Chiquita - Wilmington, DE", "Wilmington", "DE"],
    ["Watts - Franklin, NH Solo", "Franklin", "NH"],
    [
      "AAP/CQ - La Cross, WI Flex (must have CDL-A)",
      "La Cross",
      "WI",
    ],
  ])("extracts city + state from %p → %s, %s", (input, city, state) => {
    const result = parseCityStateFromDivision(input);
    expect(result).toEqual({ city, state });
  });

  it("returns null when no City, ST pattern present", () => {
    expect(parseCityStateFromDivision("3M Team")).toBeNull();
    expect(parseCityStateFromDivision("Quality Steel")).toBeNull();
    expect(parseCityStateFromDivision("LP Cylinder")).toBeNull();
    expect(parseCityStateFromDivision("Triangle General Overnight")).toBeNull();
  });

  it("returns null when state code follows a slash (Norfolk Southern Altoona/Max Meadows)", () => {
    // No clean ", ST" — the "/" pattern is not currently handled
    expect(
      parseCityStateFromDivision("Norfolk Southern Altoona/Max Meadows"),
    ).toBeNull();
  });

  it("does NOT include the dash-prefix as part of the city", () => {
    // This was the first bug in the city parser — it was greedily
    // matching "AAP/CQ - Blaine" as city. Test pins the fix.
    const result = parseCityStateFromDivision("AAP/CQ - Blaine, MN Flex");
    expect(result?.city).toBe("Blaine");
    expect(result?.city).not.toContain("/");
    expect(result?.city).not.toContain("-");
  });
});

describe("build-carrier-job.normalizeDivisionForKey", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeDivisionForKey("3M - Aberdeen, SD Solo")).toBe(
      "3m aberdeen sd solo",
    );
  });

  it("drops parentheticals", () => {
    expect(
      normalizeDivisionForKey("Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun)"),
    ).toBe("ecolab joliet il shuttle 3rd shift");
  });

  it("produces the same key for the same logical opening even with cosmetic edits", () => {
    const a = normalizeDivisionForKey("Honda - Charlotte, NC Team");
    const b = normalizeDivisionForKey("HONDA - charlotte, NC Team");
    const c = normalizeDivisionForKey("Honda - Charlotte,  NC Team   ");
    expect(a).toBe(b);
    expect(a).toBe(c);
  });
});

describe("build-carrier-job.divisionHash", () => {
  it("is stable for identical input", () => {
    expect(divisionHash("foo bar")).toBe(divisionHash("foo bar"));
  });

  it("is stable across cosmetic edits (case, whitespace, punctuation)", () => {
    expect(divisionHash("Honda - Charlotte, NC Team")).toBe(
      divisionHash("HONDA - charlotte, NC Team"),
    );
  });

  it("produces a 12-char hex string", () => {
    const h = divisionHash("anything");
    expect(h).toMatch(/^[0-9a-f]{12}$/);
  });

  it("differs for different openings", () => {
    expect(divisionHash("Honda - Charlotte, NC Team")).not.toBe(
      divisionHash("Honda - Davenport, IA Solo"),
    );
  });
});

describe("build-carrier-job.deriveEquipmentSlug", () => {
  it.each([
    ["53' dry van trailers pulling X", "dry-van"],
    ["Mixture of reefer and dry van", "reefer"],
    ["Refrigerated freight", "reefer"],
    ["Flatbed trailers", "flatbed"],
    ["Step deck cargo", "flatbed"],
    ["Tanker freight", "tanker"],
    ["Box truck deliveries", "dry-van"],
    ["Auto hauler trailers", "auto-hauler"],
    ["Intermodal containers", "intermodal"],
  ])("classifies %p as %p", (input, expected) => {
    expect(deriveEquipmentSlug(input)).toBe(expected);
  });

  it("returns null for unknown / empty text", () => {
    expect(deriveEquipmentSlug(null)).toBeNull();
    expect(deriveEquipmentSlug("")).toBeNull();
    expect(deriveEquipmentSlug("Unspecified")).toBeNull();
  });
});

describe("build-carrier-job.deriveHomeTimeArray", () => {
  it("returns ['weekly'] when no text supplied (default for dedicated)", () => {
    expect(deriveHomeTimeArray(null)).toEqual(["weekly"]);
    expect(deriveHomeTimeArray("")).toEqual(["weekly"]);
  });

  it("detects 'Home daily' as daily", () => {
    expect(deriveHomeTimeArray("Home daily")).toContain("daily");
  });

  it("detects shuttle accounts as daily", () => {
    expect(deriveHomeTimeArray("Shuttle - home every day")).toContain("daily");
  });

  it("detects 'Home weekly with 34-hour restart' as weekly", () => {
    expect(deriveHomeTimeArray("Home weekly with 34-hour restart")).toContain(
      "weekly",
    );
  });

  it("detects 'biweekly' / 'every other week' as biweekly", () => {
    expect(deriveHomeTimeArray("Home every other week")).toContain("biweekly");
    expect(deriveHomeTimeArray("Biweekly home time")).toContain("biweekly");
  });

  it("detects OTR mentions", () => {
    expect(deriveHomeTimeArray("Over-the-road runs")).toContain("otr");
    expect(deriveHomeTimeArray("OTR routes")).toContain("otr");
  });

  it("falls back to ['weekly'] when text mentions no recognizable cadence", () => {
    expect(deriveHomeTimeArray("Schedule varies")).toEqual(["weekly"]);
  });
});
