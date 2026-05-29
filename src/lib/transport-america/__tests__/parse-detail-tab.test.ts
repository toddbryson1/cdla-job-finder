// Tests for the TA detail-tab parser. Uses the actual layout of
// "Ecolab Garland-home weekly" as the gold-standard fixture (the
// only populated tab we've verified end-to-end).

import { describe, expect, it } from "vitest";
import { parseDetailTab } from "../parse-detail-tab";
import type { CellValue, SheetGrid } from "../sheets-client";

function row(...cells: string[]): CellValue[] {
  return cells.map((text) => ({ text, isGreyShaded: false }));
}

function grid(...rows: CellValue[][]): SheetGrid {
  return { rows };
}

// Real-shape fixture cribbed from the live Ecolab Garland tab.
const ECOLAB_GARLAND = grid(
  row("Title", "Ecolab Garland-home weekly"),
  row("Hiring Area", "100 mile radius of Dallas, TX (Must park at Dallas Yard – No Exceptions)"),
  row("Lanes", "Garland/Grapevine, TX to OK, KS, MO, AR, LA, NM, CO"),
  row("Miles", "2,000 per week"),
  row("Schedule", "Could be home anytime between Friday and Saturday"),
  row("Home Time", "Home weekly with 34 hour restart"),
  row("Freight Types", "Mixture of Live load/unload"),
  row("Truck Speed", "62 pedal; 65 cruise"),
  row("Bonus", "$500 New Hire Transition Bonus"),
  row("Parking", "Must Park tractor/trailer at TADA"),
  row("Requirements", "Hazmat and Tanker Endorsements; 6 months of recent verifiable experience"),
  row("Entry Points"),
  row("All Enter: $1100 per week"),
);

describe("parse-detail-tab.parseDetailTab", () => {
  it("extracts hiring radius + anchor city + state", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.hiringRadiusMiles).toBe(100);
    expect(result.anchorCity).toBe("Dallas");
    expect(result.anchorState).toBe("TX");
  });

  it("preserves the 'rest' of the Hiring Area in notes", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.notes.some((n) => /Must park at Dallas Yard/i.test(n))).toBe(true);
  });

  it("extracts Hazmat and Tanker endorsements", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.requiredEndorsements).toContain("hazmat");
    expect(result.requiredEndorsements).toContain("tanker");
  });

  it("extracts experience requirement as months", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.minExperienceMonths).toBe(6);
  });

  it("converts 'X year(s)' to months", () => {
    const g = grid(
      row("Hiring Area", "75 mile radius of Phoenix, AZ"),
      row("Requirements", "1 year of verifiable CDL-A experience"),
    );
    const result = parseDetailTab("Phoenix Tab", g);
    expect(result.minExperienceMonths).toBe(12);
  });

  it("captures Home Time description verbatim", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.homeTimeDescription).toMatch(/home weekly/i);
  });

  it("captures Lanes description verbatim", () => {
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    expect(result.lanesDescription).toMatch(/Garland\/Grapevine/);
  });

  it("captures Equipment OR Freight Types as equipmentDescription", () => {
    // The parser looks for either "Equipment" or "Freight Types"
    const g = grid(
      row("Hiring Area", "75 mile radius of Phoenix, AZ"),
      row("Equipment", "53' dry van trailers"),
    );
    expect(parseDetailTab("X", g).equipmentDescription).toMatch(/dry van/);

    const g2 = grid(
      row("Hiring Area", "75 mile radius of Phoenix, AZ"),
      row("Freight Types", "Mixture of Live load/unload"),
    );
    expect(parseDetailTab("Y", g2).equipmentDescription).toMatch(/Live load/);
  });

  it("preserves raw Pay text in notes", () => {
    const g = grid(
      row("Hiring Area", "100 mile radius of Dallas, TX"),
      row("Pay", "All Enter: $1100 per week + safety bonus"),
    );
    const result = parseDetailTab("X", g);
    expect(result.payRangeRawText).toMatch(/\$1100/);
    expect(result.notes.some((n) => /Pay \(raw\):.*\$1100/.test(n))).toBe(true);
  });

  it("returns nulls without throwing for an empty grid", () => {
    const result = parseDetailTab("Empty Tab", grid());
    expect(result.hiringRadiusMiles).toBeNull();
    expect(result.anchorCity).toBeNull();
    expect(result.anchorState).toBeNull();
    expect(result.requiredEndorsements).toEqual([]);
    expect(result.minExperienceMonths).toBeNull();
    expect(result.isComplete).toBe(false);
  });

  it("returns isComplete=true only when all core fields parsed", () => {
    const full = grid(
      row("Hiring Area", "100 mile radius of Dallas, TX"),
      row("Equipment", "Dry van trailers"),
      row("Home Time", "Home weekly"),
      row("Requirements", "6 months of recent verifiable experience"),
    );
    expect(parseDetailTab("X", full).isComplete).toBe(true);

    // Missing equipment → not complete
    const incomplete = grid(
      row("Hiring Area", "100 mile radius of Dallas, TX"),
      row("Home Time", "Home weekly"),
      row("Requirements", "6 months experience"),
    );
    expect(parseDetailTab("X", incomplete).isComplete).toBe(false);
  });

  it("isComplete=true for the real Ecolab Garland tab", () => {
    // Sanity check on the gold-standard fixture
    const result = parseDetailTab("Ecolab Garland-home weekly", ECOLAB_GARLAND);
    // Has hiring radius, anchor city/state, home time, freight types
    // (equipmentDescription), experience → should be complete
    expect(result.isComplete).toBe(true);
  });
});
