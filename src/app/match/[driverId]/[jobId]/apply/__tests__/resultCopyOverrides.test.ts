import { describe, it, expect } from "vitest";
import { parseResultPageCopyOverrides } from "../resultCopyOverrides";

describe("parseResultPageCopyOverrides", () => {
  it("returns null-defaults when input is null", () => {
    const o = parseResultPageCopyOverrides(null);
    expect(o.recruiterTeamName).toBeNull();
    expect(o.omitSourceIdInstruction).toBe(false);
    expect(o.beforeYouStartItems).toBeNull();
    expect(o.followupPromise).toBeNull();
  });

  it("returns null-defaults when input is undefined", () => {
    const o = parseResultPageCopyOverrides(undefined);
    expect(o.omitSourceIdInstruction).toBe(false);
    expect(o.beforeYouStartItems).toBeNull();
  });

  it("returns null-defaults when input is not an object", () => {
    expect(parseResultPageCopyOverrides("nope").recruiterTeamName).toBeNull();
    expect(parseResultPageCopyOverrides(42).beforeYouStartItems).toBeNull();
  });

  it("parses the Anderson-shaped override blob", () => {
    const o = parseResultPageCopyOverrides({
      recruiter_team_name: "Anderson's recruiting team",
      omit_source_id_instruction: true,
      before_you_start_items: [
        "Your full job history for the past 10 years (including non-driving jobs)",
        "2 references",
      ],
      followup_promise: "within 1–2 business days",
    });
    expect(o.recruiterTeamName).toBe("Anderson's recruiting team");
    expect(o.omitSourceIdInstruction).toBe(true);
    expect(o.beforeYouStartItems).toEqual([
      "Your full job history for the past 10 years (including non-driving jobs)",
      "2 references",
    ]);
    expect(o.followupPromise).toBe("within 1–2 business days");
  });

  it("ignores fields of the wrong type without throwing", () => {
    const o = parseResultPageCopyOverrides({
      recruiter_team_name: 123, // wrong type — ignored
      omit_source_id_instruction: "yes", // not strictly true — ignored
      before_you_start_items: ["ok", 99, "", "also-ok"], // filters empties + non-strings
      followup_promise: null,
    });
    expect(o.recruiterTeamName).toBeNull();
    expect(o.omitSourceIdInstruction).toBe(false);
    expect(o.beforeYouStartItems).toEqual(["ok", "also-ok"]);
    expect(o.followupPromise).toBeNull();
  });

  it("treats a non-array before_you_start_items as null (falls through to generic)", () => {
    const o = parseResultPageCopyOverrides({
      before_you_start_items: "not-an-array",
    });
    expect(o.beforeYouStartItems).toBeNull();
  });
});
