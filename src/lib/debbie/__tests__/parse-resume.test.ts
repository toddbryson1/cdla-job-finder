import { afterEach, describe, expect, it } from "vitest";
import {
  isMimeAccepted,
  isResumeEnabled,
  MAX_RESUME_BYTES,
  MIN_RESUME_BYTES,
  normalizeExtracted,
  parseResume,
} from "@/lib/debbie/parse-resume";

describe("isMimeAccepted", () => {
  it("accepts PDF and plain text", () => {
    expect(isMimeAccepted("application/pdf")).toBe(true);
    expect(isMimeAccepted("text/plain")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMimeAccepted("APPLICATION/PDF")).toBe(true);
    expect(isMimeAccepted("Text/Plain")).toBe(true);
  });

  it("rejects the formats deferred to a later session", () => {
    expect(isMimeAccepted("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(false); // DOCX
    expect(isMimeAccepted("image/jpeg")).toBe(false);
    expect(isMimeAccepted("image/png")).toBe(false);
  });

  it("rejects arbitrary octet-stream", () => {
    expect(isMimeAccepted("application/octet-stream")).toBe(false);
  });
});

describe("isResumeEnabled (spec §7.5 + §12 attorney gate)", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;
  const origFlag = process.env.DEBBIE_RESUME_ENABLED;

  afterEach(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
    if (origFlag === undefined) delete process.env.DEBBIE_RESUME_ENABLED;
    else process.env.DEBBIE_RESUME_ENABLED = origFlag;
  });

  it("false when both env vars absent (default — pre attorney clearance)", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.DEBBIE_RESUME_ENABLED;
    expect(isResumeEnabled()).toBe(false);
  });

  it("false when key is set but flag is not 'true'", () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "false";
    expect(isResumeEnabled()).toBe(false);
  });

  it("false when flag is 'true' but key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.DEBBIE_RESUME_ENABLED = "true";
    expect(isResumeEnabled()).toBe(false);
  });

  it("true only when BOTH key is set AND flag is exactly 'true'", () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    expect(isResumeEnabled()).toBe(true);
  });
});

describe("normalizeExtracted — defensive runtime validation of LLM tool payload", () => {
  it("returns empty when raw is not an object", () => {
    expect(normalizeExtracted(null)).toEqual({});
    expect(normalizeExtracted(undefined)).toEqual({});
    expect(normalizeExtracted("string")).toEqual({});
    expect(normalizeExtracted(42)).toEqual({});
  });

  it("accepts a valid 5-digit zip", () => {
    expect(normalizeExtracted({ home_zip: "30303" })).toEqual({ homeZip: "30303" });
  });

  it("rejects bad zips silently — wrong length, letters, etc", () => {
    // Spec §7.2: prefer no value over wrong value.
    expect(normalizeExtracted({ home_zip: "303" })).toEqual({});
    expect(normalizeExtracted({ home_zip: "ABCDE" })).toEqual({});
    expect(normalizeExtracted({ home_zip: 30303 })).toEqual({}); // wrong type
  });

  it("trims and accepts experience_years as a non-negative number, capped at 60", () => {
    expect(normalizeExtracted({ experience_years: 3 })).toEqual({ experienceYears: 3 });
    expect(normalizeExtracted({ experience_years: 1.5 })).toEqual({ experienceYears: 1.5 });
    expect(normalizeExtracted({ experience_years: 0 })).toEqual({ experienceYears: 0 });
    expect(normalizeExtracted({ experience_years: 999 })).toEqual({ experienceYears: 60 });
  });

  it("drops experience_years when negative or wrong type", () => {
    expect(normalizeExtracted({ experience_years: -1 })).toEqual({});
    expect(normalizeExtracted({ experience_years: "five" })).toEqual({});
  });

  it("accepts last_employer as trimmed string, capped at 120 chars", () => {
    expect(normalizeExtracted({ last_employer: "  Swift Transportation  " })).toEqual({
      lastEmployer: "Swift Transportation",
    });
    const long = "x".repeat(200);
    expect(normalizeExtracted({ last_employer: long }).lastEmployer?.length).toBe(120);
  });

  it("drops empty / whitespace-only last_employer", () => {
    expect(normalizeExtracted({ last_employer: "" })).toEqual({});
    expect(normalizeExtracted({ last_employer: "   " })).toEqual({});
  });

  it("accepts known equipment slugs, drops unknown values", () => {
    expect(
      normalizeExtracted({ equipment_driven: ["reefer", "dry-van", "unknown-slug"] }),
    ).toEqual({ equipmentDriven: ["reefer", "dry-van"] });
  });

  it("returns no equipment_driven when array empties out", () => {
    expect(normalizeExtracted({ equipment_driven: ["nonexistent"] })).toEqual({});
  });

  it("handles a multi-field response correctly", () => {
    expect(
      normalizeExtracted({
        home_zip: "30303",
        experience_years: 4,
        last_employer: "C.R. England",
        equipment_driven: ["reefer", "flatbed"],
      }),
    ).toEqual({
      homeZip: "30303",
      experienceYears: 4,
      lastEmployer: "C.R. England",
      equipmentDriven: ["reefer", "flatbed"],
    });
  });
});

describe("parseResume — feature flag + size gates", () => {
  const origKey = process.env.ANTHROPIC_API_KEY;
  const origFlag = process.env.DEBBIE_RESUME_ENABLED;

  afterEach(() => {
    if (origKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = origKey;
    if (origFlag === undefined) delete process.env.DEBBIE_RESUME_ENABLED;
    else process.env.DEBBIE_RESUME_ENABLED = origFlag;
  });

  it("returns not_configured when flag is off — no Anthropic call fires", async () => {
    delete process.env.DEBBIE_RESUME_ENABLED;
    const r = await parseResume(Buffer.alloc(2048), "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_configured");
  });

  it("returns file_unsupported for DOCX (deferred to a later commit)", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    const r = await parseResume(
      Buffer.alloc(2048),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("file_unsupported");
  });

  it("returns file_too_large when buffer exceeds 5MB", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    const big = Buffer.alloc(MAX_RESUME_BYTES + 1);
    const r = await parseResume(big, "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("file_too_large");
  });

  it("returns file_too_small when buffer is under floor", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    const tiny = Buffer.alloc(MIN_RESUME_BYTES - 1);
    const r = await parseResume(tiny, "application/pdf");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("file_too_small");
  });
});
