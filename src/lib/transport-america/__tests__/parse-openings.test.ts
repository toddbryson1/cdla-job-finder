// Tests for the TA openings-sheet parser. Pure function; we build
// SheetGrid fixtures by hand to exercise each path.

import { describe, expect, it } from "vitest";
import { parseOpenings } from "../parse-openings";
import type { CellValue, SheetGrid } from "../sheets-client";

// Helper: build a row of (text, isGreyShaded) cells.
function row(...cells: Array<string | [string, boolean]>): CellValue[] {
  return cells.map((c) =>
    typeof c === "string"
      ? { text: c, isGreyShaded: false }
      : { text: c[0], isGreyShaded: c[1] },
  );
}

function grid(...rows: CellValue[][]): SheetGrid {
  return { rows };
}

const HEADER = row("Date Opened", "Division", "Drivers Needed", "May 28", "Jun 4", "Jun 11");

describe("parse-openings.parseOpenings", () => {
  it("returns empty when grid is empty", () => {
    const result = parseOpenings({ rows: [] });
    expect(result.rows).toEqual([]);
  });

  it("throws when header row is missing", () => {
    const g = grid(
      row("foo", "bar", "baz"),
      row("3/1", "3M - X, SD Solo", "1"),
    );
    expect(() => parseOpenings(g)).toThrow(/expected header/i);
  });

  it("parses a basic opening row", () => {
    const g = grid(
      HEADER,
      row("3/1", "3M - Aberdeen, SD Solo", "1", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].division).toBe("3M - Aberdeen, SD Solo");
    expect(result.rows[0].driversNeeded).toBe(1);
    expect(result.rows[0].dateOpened).toBe("3/1");
    expect(result.rows[0].isFilled).toBe(false);
  });

  it("skips blank rows", () => {
    const g = grid(
      HEADER,
      row("", "", "", "", "", ""),
      row("3/1", "3M - Aberdeen, SD Solo", "1", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows).toHaveLength(1);
  });

  it("skips the Total: summary row", () => {
    const g = grid(
      HEADER,
      row("3/1", "3M - Aberdeen, SD Solo", "1", "", "", ""),
      row("", "Total:", "39", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows).toHaveLength(1);
  });

  it("excludes CDL-B openings, counts them separately", () => {
    const g = grid(
      HEADER,
      row("3/1", "3M - Aberdeen, SD Solo", "1", "", "", ""),
      row("3/2", "Foley - Dodge City, KS CDL-B", "2", "", "", ""),
      row("3/3", "VWR - Aurora, CO CDL-B", "1", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows).toHaveLength(1); // only 3M, the two CDL-B excluded
    expect(result.cdlBExcluded).toBe(2);
  });

  it("flags row as filled when D-F columns are grey-shaded", () => {
    // ≥half of D-F grey = filled
    const g = grid(
      HEADER,
      row(
        "3/1",
        "Honda - Davenport, IA Solo",
        "1",
        ["Karen(1)", true],
        ["Steve(1)", true],
        ["", false],
      ),
    );
    const result = parseOpenings(g);
    expect(result.rows[0].isFilled).toBe(true);
  });

  it("does NOT flag as filled when only 1 of 3 D-F columns is grey", () => {
    const g = grid(
      HEADER,
      row(
        "3/1",
        "Honda - Davenport, IA Solo",
        "1",
        ["Karen(1)", true],
        ["", false],
        ["", false],
      ),
    );
    const result = parseOpenings(g);
    expect(result.rows[0].isFilled).toBe(false);
  });

  it("does NOT flag as filled based on Division-cell shading alone", () => {
    // Old (incorrect) behavior checked the Division cell. New code
    // ignores it and only looks at D-F columns. This test pins that.
    const g = grid(
      HEADER,
      row(
        "3/1",
        ["Honda - Davenport, IA Solo", true], // Division cell IS grey
        "1",
        ["", false],
        ["", false],
        ["", false],
      ),
    );
    const result = parseOpenings(g);
    expect(result.rows[0].isFilled).toBe(false);
  });

  it("parses driversNeeded from free text like '1 (1/2 team)'", () => {
    const g = grid(
      HEADER,
      row("3/1", "Honda - Davenport, IA Solo", "1 (1/2 team)", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows[0].driversNeeded).toBe(1);
    expect(result.rows[0].driversNeededRaw).toBe("1 (1/2 team)");
  });

  it("returns null driversNeeded when unparseable", () => {
    const g = grid(
      HEADER,
      row("3/1", "Honda - Davenport, IA Solo", "TBD", "", "", ""),
    );
    const result = parseOpenings(g);
    expect(result.rows[0].driversNeeded).toBeNull();
  });
});
