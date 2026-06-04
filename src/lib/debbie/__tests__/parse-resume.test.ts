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

  it("accepts JPEG / PNG / WebP (driver photographs a paper resume per spec §7.1)", () => {
    expect(isMimeAccepted("image/jpeg")).toBe(true);
    expect(isMimeAccepted("image/png")).toBe(true);
    expect(isMimeAccepted("image/webp")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isMimeAccepted("APPLICATION/PDF")).toBe(true);
    expect(isMimeAccepted("Text/Plain")).toBe(true);
    expect(isMimeAccepted("Image/JPEG")).toBe(true);
  });

  it("accepts DOCX (transcoded via mammoth to plain text)", () => {
    expect(
      isMimeAccepted(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ),
    ).toBe(true);
  });

  it("accepts HEIC / HEIF (iPhone default — transcoded to JPEG server-side via heic-convert)", () => {
    expect(isMimeAccepted("image/heic")).toBe(true);
    expect(isMimeAccepted("image/heif")).toBe(true);
    expect(isMimeAccepted("IMAGE/HEIC")).toBe(true);
  });

  it("rejects arbitrary octet-stream + GIFs (vision API doesn't support GIF input)", () => {
    expect(isMimeAccepted("application/octet-stream")).toBe(false);
    expect(isMimeAccepted("image/gif")).toBe(false);
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

  it("returns file_unsupported when DOCX bytes aren't a real .docx (zero-filled buffer)", async () => {
    // Mammoth fails to open a buffer that isn't a zip. We surface
    // that as file_unsupported with a "save as PDF" hint rather than
    // letting a cryptic mammoth error bubble up to the driver.
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    const r = await parseResume(
      Buffer.alloc(2048),
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("file_unsupported");
      // Driver-visible hint should point them at PDF as the fallback.
      expect(r.error.toLowerCase()).toContain("pdf");
    }
  });

  it("returns file_unsupported when HEIC bytes aren't a real HEIC (transcode fails before any Anthropic call)", async () => {
    // heic-convert's libheif WASM throws on a buffer that isn't a HEIC
    // container. We catch it and surface file_unsupported with the
    // screenshot workaround — no network call fires, so this is fully
    // deterministic without a real .heic fixture (which can't be
    // produced here: no HEVC encoder is available locally).
    process.env.ANTHROPIC_API_KEY = "sk-fake";
    process.env.DEBBIE_RESUME_ENABLED = "true";
    const r = await parseResume(Buffer.alloc(2048), "image/heic");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("file_unsupported");
      // Driver-visible hint should point them at the screenshot path.
      expect(r.error.toLowerCase()).toContain("screenshot");
    }
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
