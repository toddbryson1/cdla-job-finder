import { describe, expect, it } from "vitest";
import { assessDriver } from "@/lib/advisor/assessment";

// The non-negotiable property: EVERY weakness carries a path forward.
// A weakness is a map, not a sentence. Plus: no adverse-action language.

const ADVERSE = /rejected|disqualified|you don'?t qualify|you'?re done|hopeless/i;

describe("assessDriver", () => {
  it("pairs every weakness with a non-empty path forward", () => {
    // A driver with several obstacles at once.
    const a = assessDriver({
      experienceMonths: 2,
      endorsements: [],
      terminated: true,
      sapStatus: "in-sap",
      accidents3yrAtFaultCount: 1,
      tickets3yrCount: 0,
      duiEver: true,
      felonyEver: false,
    });
    expect(a.weaknesses.length).toBeGreaterThan(0);
    for (const w of a.weaknesses) {
      expect(w.pathForward.trim().length).toBeGreaterThan(0);
      expect(w.label).not.toMatch(ADVERSE);
      expect(w.pathForward).not.toMatch(ADVERSE);
    }
  });

  it("names the strong 6-month clean driver as strong, not weak on record", () => {
    const a = assessDriver({
      experienceMonths: 6,
      endorsements: ["hazmat"],
      terminated: false,
      sapStatus: "not-in-sap",
      accidents3yrAtFaultCount: 0,
      tickets3yrCount: 0,
      duiEver: false,
      felonyEver: false,
    });
    const text = a.strengths.map((s) => s.label).join(" ");
    expect(text).toMatch(/clean record/i);
    expect(text).toMatch(/hazmat/i);
    // 6 months is below 12 → an honest "needs more seat time" weakness,
    // but it must come with a path forward.
    const seat = a.weaknesses.find((w) => /seat time|under a year/i.test(w.label));
    expect(seat?.pathForward).toMatch(/months|tier|on-ramp/i);
  });

  it("does not assert a clean record when the record is unknown (Stage 1)", () => {
    const a = assessDriver({
      experienceMonths: 30,
      endorsements: [],
      terminated: false,
      sapStatus: "not-in-sap",
      // record fields all undefined → unknown
    });
    expect(a.strengths.map((s) => s.label).join(" ")).not.toMatch(/clean record/i);
    // Experience strength still shows.
    expect(a.strengths.map((s) => s.label).join(" ")).toMatch(/years/i);
  });

  it("treats completed-SAP as a path-to-options weakness, not a verdict", () => {
    const a = assessDriver({
      experienceMonths: 24,
      endorsements: [],
      terminated: false,
      sapStatus: "completed-sap",
    });
    const sap = a.weaknesses.find((w) => /SAP/i.test(w.label));
    expect(sap).toBeDefined();
    expect(sap!.pathForward).toMatch(/filtered|accept/i);
  });
});
