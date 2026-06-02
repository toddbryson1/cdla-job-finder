import { describe, expect, it } from "vitest";
import {
  EMPTY_FIELDS,
  mergeExtracted,
  scheduleToHomeTime,
  type DebbieIntakeFields,
} from "@/lib/debbie/intake-types";

// These are the pure helpers the client + server both call. The LLM
// turn handler (runDebbieIntakeTurn) is tested separately because it
// requires mocking the Anthropic SDK.

describe("mergeExtracted", () => {
  it("starts empty + fills one field at a time", () => {
    const after = mergeExtracted(EMPTY_FIELDS, { homeZip: "30303" });
    expect(after.homeZip).toBe("30303");
    expect(after.experienceYears).toBeNull();
    expect(after.schedule).toBeNull();
  });

  it("preserves previously gathered fields when a new extract is partial", () => {
    const partway: DebbieIntakeFields = {
      ...EMPTY_FIELDS,
      homeZip: "30303",
      experienceYears: 8,
    };
    const after = mergeExtracted(partway, { schedule: "regional" });
    expect(after.homeZip).toBe("30303");
    expect(after.experienceYears).toBe(8);
    expect(after.schedule).toBe("regional");
  });

  it("does not overwrite a set field with undefined (skips silently)", () => {
    const partway: DebbieIntakeFields = {
      ...EMPTY_FIELDS,
      homeZip: "30303",
    };
    const after = mergeExtracted(partway, {
      experienceYears: 2,
      // homeZip intentionally absent
    });
    expect(after.homeZip).toBe("30303");
  });

  it("DOES overwrite when the new extract has the same field again — confirmation step patches", () => {
    // Driver said "I'm in 30303" then corrected at confirmation: "actually 30309".
    const partway: DebbieIntakeFields = {
      ...EMPTY_FIELDS,
      homeZip: "30303",
    };
    const after = mergeExtracted(partway, { homeZip: "30309" });
    expect(after.homeZip).toBe("30309");
  });

  it("can capture termination + reason in the same turn", () => {
    const after = mergeExtracted(EMPTY_FIELDS, {
      terminatedLastJob: true,
      terminationReason: "missed too many days when my kid was in the hospital",
    });
    expect(after.terminatedLastJob).toBe(true);
    expect(after.terminationReason).toContain("hospital");
  });
});

describe("scheduleToHomeTime", () => {
  // The matching engine filters by the driver's accepted home-time
  // array. Debbie collapses Q3 to four buckets; this maps them onto
  // the existing intake-schema enum array.

  it("local → ['daily']", () => {
    expect(scheduleToHomeTime("local")).toEqual(["daily"]);
  });

  it("regional → ['weekly']", () => {
    expect(scheduleToHomeTime("regional")).toEqual(["weekly"]);
  });

  it("otr → ['otr']", () => {
    expect(scheduleToHomeTime("otr")).toEqual(["otr"]);
  });

  it("'any' expands to all four home-time types so matching is wide open", () => {
    const result = scheduleToHomeTime("any");
    expect(result).toContain("daily");
    expect(result).toContain("weekly");
    expect(result).toContain("biweekly");
    expect(result).toContain("otr");
    expect(result.length).toBe(4);
  });

  it("null falls back to weekly (safe regional default)", () => {
    // Should never reach the matching engine with null in practice
    // because the consent gate checks all fields are set, but defensive.
    expect(scheduleToHomeTime(null)).toEqual(["weekly"]);
  });
});

describe("EMPTY_FIELDS", () => {
  it("all six fields start as null", () => {
    expect(EMPTY_FIELDS.homeZip).toBeNull();
    expect(EMPTY_FIELDS.experienceYears).toBeNull();
    expect(EMPTY_FIELDS.schedule).toBeNull();
    expect(EMPTY_FIELDS.terminatedLastJob).toBeNull();
    expect(EMPTY_FIELDS.terminationReason).toBeNull();
    expect(EMPTY_FIELDS.sapStatus).toBeNull();
  });
});
