// Tests for the Division → display-title polish.

import { describe, expect, it } from "vitest";
import { polishDivisionForTitle } from "../display-title";

describe("display-title.polishDivisionForTitle", () => {
  describe("account abbreviation expansion", () => {
    it.each([
      ["AAP/CQ - Blaine, MN Flex", "Advance Auto Parts / Carquest — Blaine, MN Flex"],
      ["AA/CQ Line haul - Blaine", "Advance Auto Parts / Carquest Line haul — Blaine"],
      ["AA/Carquest Bakersfield, CA", "Advance Auto Parts / Carquest Bakersfield, CA"],
      ["AAP Salina KS", "Advance Auto Parts Salina KS"],
      ["AA Lakeland, FL", "Advance Auto Parts Lakeland, FL"],
      ["NFS Altoona, PA", "Norfolk Southern Altoona, PA"],
      ["Norfolk Southern Altoona/Max Meadows", "Norfolk Southern Altoona/Max Meadows"], // already friendly
      ["VWR - Aurora, CO", "VWR Scientific — Aurora, CO"],
    ])("expands %p → %p", (input, expected) => {
      expect(polishDivisionForTitle(input)).toBe(expected);
    });

    it("leaves already-friendly titles alone (just dash polish)", () => {
      expect(polishDivisionForTitle("Honda - Charlotte, NC Team")).toBe(
        "Honda — Charlotte, NC Team",
      );
      expect(polishDivisionForTitle("3M - Aberdeen, SD Solo")).toBe(
        "3M — Aberdeen, SD Solo",
      );
    });

    it("leaves unknown abbreviations alone", () => {
      // BPI is intentionally left as-is per the spec discussion
      expect(polishDivisionForTitle("BPI McHenry - Yard")).toBe(
        "BPI McHenry — Yard",
      );
    });
  });

  describe("trailing parentheticals", () => {
    it("strips a single trailing parenthetical (recruiter notes)", () => {
      expect(
        polishDivisionForTitle(
          "Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun, M, W, F)",
        ),
      ).toBe("Ecolab — Joliet, IL Shuttle 3rd shift");
    });

    it("strips trailing parenthetical even after account expansion", () => {
      expect(
        polishDivisionForTitle("AAP/CQ - La Cross, WI Flex (must have CDL-A)"),
      ).toBe("Advance Auto Parts / Carquest — La Cross, WI Flex");
    });

    it("does NOT strip parentheticals in the middle", () => {
      // The spec sometimes has parentheticals mid-string (rare).
      // Keep them so we don't accidentally drop important context.
      expect(
        polishDivisionForTitle(
          "AAP/CQ (Final Mile) - La Cross, WI",
        ),
      ).toContain("(Final Mile)");
    });
  });

  describe("dash style normalization", () => {
    it("converts first ' - ' to em-dash", () => {
      expect(polishDivisionForTitle("Honda - Davenport, IA Flex")).toBe(
        "Honda — Davenport, IA Flex",
      );
    });

    it("does NOT convert non-separator dashes (within a word)", () => {
      // hyphenated city names stay hyphenated
      expect(polishDivisionForTitle("CAT - Lafayette, IN")).toBe(
        "Caterpillar — Lafayette, IN",
      );
    });

    it("does NOT convert subsequent ' - ' separators", () => {
      // Only the FIRST " - " gets the em-dash to preserve any
      // intentional hyphens later in the string.
      const result = polishDivisionForTitle("X - foo - bar");
      // First gets em-dashed, second stays
      expect(result).toBe("X — foo - bar");
    });
  });

  describe("idempotence", () => {
    it("polishing twice produces the same result", () => {
      const inputs = [
        "AAP/CQ - Blaine, MN Flex",
        "Honda - Charlotte, NC Team",
        "3M - Aberdeen, SD Solo",
        "NFS Altoona, PA",
      ];
      for (const input of inputs) {
        const once = polishDivisionForTitle(input);
        const twice = polishDivisionForTitle(once);
        expect(twice).toBe(once);
      }
    });
  });

  describe("edge cases", () => {
    it("trims leading/trailing whitespace", () => {
      expect(polishDivisionForTitle("  Honda - Charlotte, NC  ")).toBe(
        "Honda — Charlotte, NC",
      );
    });

    it("handles empty string", () => {
      expect(polishDivisionForTitle("")).toBe("");
    });

    it("handles strings with no recognizable pattern", () => {
      expect(polishDivisionForTitle("Quality Steel")).toBe("Quality Steel");
      expect(polishDivisionForTitle("LP Cylinder")).toBe("LP Cylinder");
    });
  });
});
