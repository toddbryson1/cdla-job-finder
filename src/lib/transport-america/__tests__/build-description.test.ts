// Tests for the Division → description generator.

import { describe, expect, it } from "vitest";
import {
  buildMinimalDescription,
  parseDivisionSemantics,
} from "../build-description";

describe("build-description.parseDivisionSemantics", () => {
  it("extracts account, city, state, role from a typical Division", () => {
    const sem = parseDivisionSemantics("AAP/CQ - Blaine, MN Line Haul");
    expect(sem.account).toBe("Advance Auto Parts / Carquest");
    expect(sem.city).toBe("Blaine");
    expect(sem.state).toBe("MN");
    expect(sem.role).toBe("line-haul");
  });

  it("identifies role: solo / team / flex / shuttle / yard / final-mile", () => {
    expect(parseDivisionSemantics("Honda - Davenport, IA Solo").role).toBe("solo");
    expect(parseDivisionSemantics("3M Team Dekalb-Houston").role).toBe("team");
    expect(parseDivisionSemantics("AAP/CQ - Blaine, MN Flex").role).toBe("flex");
    expect(
      parseDivisionSemantics("Ecolab - Joliet, IL Shuttle 3rd shift").role,
    ).toBe("shuttle");
    expect(parseDivisionSemantics("BPI McHenry - Yard").role).toBe("yard");
    expect(
      parseDivisionSemantics("AAP/CQ - Salina, KS Final Mile").role,
    ).toBe("final-mile");
    expect(parseDivisionSemantics("Foley Regional Kansas City").role).toBe(
      "regional",
    );
    expect(parseDivisionSemantics("Freedom Fleet Owner Operators").role).toBe(
      "owner-operator",
    );
  });

  it("prioritizes line-haul over solo when both appear", () => {
    // "AA/CQ Line haul - Blaine" — line-haul wins (it's the
    // distinguishing role; everything is implicitly solo)
    expect(
      parseDivisionSemantics("AA/CQ Line haul - Blaine").role,
    ).toBe("line-haul");
  });

  it("extracts shift information", () => {
    expect(
      parseDivisionSemantics("Ecolab - Joliet, IL Shuttle 3rd shift").shift,
    ).toBe("3rd shift");
    expect(
      parseDivisionSemantics("AAP/CQ - Salina, KS Yard 3rd shift").shift,
    ).toBe("3rd shift");
    expect(
      parseDivisionSemantics("CAT - Lafayette, IN 1st shift").shift,
    ).toBe("1st shift");
  });

  it("extracts day-of-week schedule from parentheticals", () => {
    expect(
      parseDivisionSemantics(
        "Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun, M, W, F)",
      ).scheduleNotes,
    ).toMatch(/Sun, M, W, F/);
  });

  it("ignores parentheticals that are just driver counts", () => {
    expect(
      parseDivisionSemantics("Ecolab - Joliet, IL Shuttle (2 needed)")
        .scheduleNotes,
    ).toBeNull();
  });

  it("returns null fields when no semantics are present", () => {
    const sem = parseDivisionSemantics("Quality Steel");
    expect(sem.account).toBe("Quality Steel");
    expect(sem.city).toBeNull();
    expect(sem.state).toBeNull();
    expect(sem.role).toBeNull();
    expect(sem.shift).toBeNull();
  });

  it("handles divisions without city/state cleanly", () => {
    const sem = parseDivisionSemantics("3M Team");
    expect(sem.account).toBe("3M Team");
    expect(sem.role).toBe("team");
    expect(sem.city).toBeNull();
  });
});

describe("build-description.buildMinimalDescription", () => {
  it("produces a useful paragraph with role, account, and location", () => {
    const desc = buildMinimalDescription("AAP/CQ - Blaine, MN Line Haul");
    expect(desc).toMatch(/line-haul/i);
    expect(desc).toMatch(/Advance Auto Parts \/ Carquest/);
    expect(desc).toMatch(/Blaine, MN/);
  });

  it("mentions Transport America + DLM honestly", () => {
    const desc = buildMinimalDescription("3M - Aberdeen, SD Solo");
    expect(desc).toMatch(/Transport America/i);
    expect(desc).toMatch(/DLM Professional/i);
  });

  it("does NOT quote made-up pay or home-time", () => {
    const desc = buildMinimalDescription("Honda - Davenport, IA Solo");
    // No fake numbers
    expect(desc).not.toMatch(/\$\d/);
    expect(desc).not.toMatch(/\d+\s*cpm/i);
  });

  it("includes shuttle-specific context for shuttle accounts", () => {
    const desc = buildMinimalDescription(
      "Ecolab - Joliet, IL Shuttle 3rd shift",
    );
    expect(desc).toMatch(/shuttle/i);
    expect(desc).toMatch(/home daily/i);
  });

  it("includes team-specific context for team accounts", () => {
    const desc = buildMinimalDescription("Honda - Charlotte, NC Team");
    expect(desc).toMatch(/team/i);
    expect(desc).toMatch(/two drivers/i);
  });

  it("handles divisions without location gracefully", () => {
    const desc = buildMinimalDescription("Quality Steel");
    expect(desc).toMatch(/Quality Steel/);
    expect(desc).toMatch(/Transport America/);
    expect(desc).not.toContain("undefined");
    expect(desc).not.toContain("null");
  });

  it("handles divisions without role gracefully", () => {
    const desc = buildMinimalDescription("Chiquita - Wilmington, DE");
    expect(desc).toMatch(/Wilmington, DE/);
    expect(desc).toMatch(/dedicated lane/i);
  });

  it("includes day-of-week schedule when provided", () => {
    const desc = buildMinimalDescription(
      "Ecolab - Joliet, IL Shuttle 3rd shift (1 for Sun, M, W, F)",
    );
    expect(desc).toMatch(/Sun, M, W, F/);
  });

  it("includes shift info when provided", () => {
    const desc = buildMinimalDescription("Ecolab Huntington 2nd Shift");
    expect(desc).toMatch(/2nd shift/);
  });

  it("does not double-period at the end of the lead sentence", () => {
    const desc = buildMinimalDescription(
      "AAP/CQ - Blaine, MN Line Haul (must have CDL-A)",
    );
    // No "lane.." in any line
    for (const line of desc.split("\n")) {
      expect(line).not.toMatch(/\.\./);
    }
  });
});
