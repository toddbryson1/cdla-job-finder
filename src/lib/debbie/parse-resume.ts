// Server-side resume parser for Debbie's paperclip-upload feature.
// Takes a PDF or TXT resume, asks Claude to extract the handful of
// Stage 1 fields that show up on resumes (zip, years of experience,
// last employer, equipment driven), returns them so the client can
// merge into Debbie's running fields state.
//
// FEATURE FLAG (spec §7.5 + §12):
//   Resume parsing introduces a new data flow — driver-supplied
//   document is processed by an automated parser and partially
//   stored. Spec §12 requires attorney review of the Stage 1 consent
//   language before this can go live in production. Until that
//   clears, DEBBIE_RESUME_ENABLED stays unset and isResumeEnabled()
//   returns false — the paperclip button doesn't render, the route
//   returns 503, and no driver's resume ever leaves the browser.
//
// WHAT THE LLM EXTRACTS:
//   - homeZip: only when clearly on the resume header
//   - experienceYears: total tractor-trailer experience as a decimal
//   - lastEmployer: the most recent carrier name (used only in the
//     confirmation playback — never auto-fills carrier preferences)
//   - equipmentDriven: array of equipment slugs the driver has run
//     (informational; Debbie doesn't ask equipment in Stage 1 per spec)
//
// Spec §7.2 is explicit that resume extraction is a hint, not a
// replacement for the conversation. The client confirms each field
// with the driver before treating it as answered.

import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5";

/** Whisper's hard limit is 25MB; resumes are tiny so we're stricter.
 * Anthropic's image-input limit is 5MB per image too, so this lines
 * up cleanly with both code paths.
 */
export const MAX_RESUME_BYTES = 5 * 1024 * 1024; // 5 MiB
export const MIN_RESUME_BYTES = 200;

// Spec §7.1 lists PDF + DOCX + TXT + common image formats.
// Supported in v1:
//   - PDF, TXT, image formats — sent directly to Anthropic
//   - DOCX — transcoded to plain text via mammoth and sent as text
//
// Still deferred: HEIC (iOS-only; users can take a screenshot or
// change camera settings to JPEG to work around).
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ACCEPTED_MIMES = [
  "application/pdf",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp",
  DOCX_MIME,
] as const;

type ImageMime = "image/jpeg" | "image/png" | "image/webp";

function isImageMime(mime: string): mime is ImageMime {
  const m = mime.toLowerCase();
  return m === "image/jpeg" || m === "image/png" || m === "image/webp";
}

export function isResumeEnabled(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  const enabled = process.env.DEBBIE_RESUME_ENABLED;
  return Boolean(key) && enabled === "true";
}

/** Mirror of DebbieIntakeFields shape — only the fields a resume can
 * plausibly carry. terminatedLastJob + sapStatus are NEVER inferred
 * from resumes; they must come from the conversation. */
export interface DebbieResumeExtracted {
  homeZip?: string;
  experienceYears?: number;
  lastEmployer?: string;
  equipmentDriven?: string[];
}

export type ParseResumeCode =
  | "not_configured"
  | "file_too_large"
  | "file_too_small"
  | "file_unsupported"
  | "api_error"
  | "rate_limited"
  | "network";

export type ParseResumeResult =
  | { ok: true; extracted: DebbieResumeExtracted }
  | { ok: false; code: ParseResumeCode; error: string };

export function isMimeAccepted(mime: string): boolean {
  return ACCEPTED_MIMES.includes(mime.toLowerCase() as (typeof ACCEPTED_MIMES)[number]);
}

const RESUME_EXTRACTION_TOOL: Anthropic.Tool = {
  name: "extract_resume_fields",
  description:
    "Record what was extracted from the driver's resume. Only fill fields you can confirm from the document — NEVER guess. Per spec §7.2 this is a hint for the conversation, not a replacement for the driver's own answers.",
  input_schema: {
    type: "object",
    properties: {
      home_zip: {
        type: "string",
        description:
          "5-digit US zip code, ONLY if it appears in the resume header / address. Don't infer from city names.",
      },
      experience_years: {
        type: "number",
        description:
          "Total years of tractor-trailer (Class A) driving experience. Decimal — 18 months = 1.5. Sum up the work history if multiple driving jobs. 0 if no driving experience is shown.",
      },
      last_employer: {
        type: "string",
        description:
          "Most recent trucking employer's name as written on the resume. Used only for the conversational playback. Omit if the latest job isn't driving.",
      },
      equipment_driven: {
        type: "array",
        items: {
          type: "string",
          enum: [
            "dry-van",
            "reefer",
            "flatbed",
            "tanker",
            "hazmat",
            "auto-hauler",
            "doubles",
            "triples",
            "oversized",
            "dump",
            "mixer",
            "intermodal",
          ],
        },
        description:
          "Equipment types the driver has run, per the resume. Map free-text mentions (e.g. 'refrigerated', 'temp-controlled' → reefer; 'step-deck' → flatbed). Omit if no equipment is clearly described.",
      },
    },
  },
};

const SYSTEM_PROMPT = `You are a precise resume parser for CDLA.jobs's driver intake. Read the attached document and extract ONLY the fields you can confirm from what is written. Never guess. Never fabricate.

OUTPUT
- Use the extract_resume_fields tool to return your findings.
- Leave a field UNSET if the resume doesn't clearly state it. An empty result is preferable to a wrong one.

VOICE
- This output is NOT shown to the driver directly — it gets merged into a chat session where Debbie will confirm each field conversationally. Your job is faithful extraction; the chat handles disclosure and review.

DO NOT
- Infer home zip from a city name without an explicit zip.
- Aggregate non-driving work into experience_years.
- Map ambiguous equipment ("box truck", "delivery truck") to a CDL-A slug.`;

export async function parseResume(
  fileBuffer: ArrayBuffer | Buffer,
  mimeType: string,
): Promise<ParseResumeResult> {
  if (!isResumeEnabled()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Resume parsing is disabled (DEBBIE_RESUME_ENABLED off or ANTHROPIC_API_KEY missing).",
    };
  }

  if (!isMimeAccepted(mimeType)) {
    return {
      ok: false,
      code: "file_unsupported",
      error: `Only PDF and plain text resumes are supported in v1; got "${mimeType}".`,
    };
  }

  const buf = fileBuffer instanceof ArrayBuffer ? Buffer.from(fileBuffer) : fileBuffer;
  if (buf.byteLength > MAX_RESUME_BYTES) {
    return {
      ok: false,
      code: "file_too_large",
      error: `Resume is ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB — max is 5MB.`,
    };
  }
  if (buf.byteLength < MIN_RESUME_BYTES) {
    return {
      ok: false,
      code: "file_too_small",
      error: "File is empty or too small to be a real resume.",
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Four input branches:
  //   - PDF → base64 `document` content block (Anthropic reads
  //     natively, no upstream OCR step)
  //   - Image → base64 `image` content block (vision input). Common
  //     for drivers who photograph a paper resume per spec §7.1.
  //   - DOCX → transcoded to plain text via mammoth, then sent as a
  //     text block. Anthropic doesn't read DOCX natively. Mammoth
  //     extracts the prose and drops formatting — which is exactly
  //     what we want for field extraction (the LLM doesn't care
  //     about heading styles).
  //   - Text → plain `text` block.
  const mimeLower = mimeType.toLowerCase();
  let payloadBlock: Anthropic.ContentBlockParam;
  if (mimeLower === "application/pdf") {
    payloadBlock = {
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: buf.toString("base64"),
      },
    };
  } else if (isImageMime(mimeLower)) {
    payloadBlock = {
      type: "image",
      source: {
        type: "base64",
        media_type: mimeLower,
        data: buf.toString("base64"),
      },
    };
  } else if (mimeLower === DOCX_MIME) {
    const transcoded = await transcodeDocxToText(buf);
    if (!transcoded.ok) return transcoded;
    payloadBlock = { type: "text", text: transcoded.text };
  } else {
    payloadBlock = {
      type: "text",
      text: buf.toString("utf-8"),
    };
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        payloadBlock,
        {
          type: "text",
          text: "Extract what you can. Leave fields you can't confirm unset.",
        },
      ],
    },
  ];

  let res: Anthropic.Message;
  try {
    // 45s timeout — resume parsing involves an image / PDF round
    // trip with the LLM, so it's intentionally longer than the chat
    // turn (which is text-only). Route maxDuration is 60s; this
    // leaves 15s of margin for the response to flush.
    res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        tools: [RESUME_EXTRACTION_TOOL],
        tool_choice: { type: "tool", name: RESUME_EXTRACTION_TOOL.name },
        messages,
      },
      { timeout: 45_000 },
    );
  } catch (err) {
    const e = err as { status?: number; message?: string };
    if (e.status === 429) {
      return { ok: false, code: "rate_limited", error: "Anthropic rate limit hit." };
    }
    return {
      ok: false,
      code: e.status && e.status >= 400 && e.status < 500 ? "api_error" : "network",
      error: `Anthropic call failed: ${e.message ?? String(err)}`,
    };
  }

  const toolBlock = res.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    return {
      ok: false,
      code: "api_error",
      error: "Anthropic didn't return a tool_use block.",
    };
  }
  return { ok: true, extracted: normalizeExtracted(toolBlock.input) };
}

/**
 * Defensive runtime validation of the tool payload. SDK types it as
 * `unknown`. Any field with a wrong type is silently dropped — we
 * prefer "no value" over "wrong value" per spec §7.2.
 */
export function normalizeExtracted(raw: unknown): DebbieResumeExtracted {
  if (!raw || typeof raw !== "object") return {};
  const obj = raw as Record<string, unknown>;
  const out: DebbieResumeExtracted = {};

  if (typeof obj.home_zip === "string") {
    const z = obj.home_zip.trim();
    if (/^\d{5}$/.test(z)) out.homeZip = z;
  }
  if (typeof obj.experience_years === "number" && obj.experience_years >= 0) {
    out.experienceYears = Math.min(60, obj.experience_years);
  }
  if (typeof obj.last_employer === "string") {
    const e = obj.last_employer.trim().slice(0, 120);
    if (e.length > 0) out.lastEmployer = e;
  }
  if (Array.isArray(obj.equipment_driven)) {
    const known = new Set([
      "dry-van",
      "reefer",
      "flatbed",
      "tanker",
      "hazmat",
      "auto-hauler",
      "doubles",
      "triples",
      "oversized",
      "dump",
      "mixer",
      "intermodal",
    ]);
    const eq = (obj.equipment_driven as unknown[])
      .filter((v): v is string => typeof v === "string" && known.has(v))
      .slice(0, 12);
    if (eq.length > 0) out.equipmentDriven = eq;
  }

  return out;
}

/**
 * DOCX → plain text via mammoth.extractRawText. Drops all styling,
 * which is exactly what we want for field extraction — the LLM only
 * cares about the prose. Returns a tagged success/failure rather
 * than throwing so the parseResume caller can route the failure
 * code into the same shape as other unsupported-file responses.
 *
 * Mammoth is reasonably tolerant of weird .docx output (Google Docs
 * export, LibreOffice, older Word versions). The most common failure
 * is a non-.docx file masquerading as one (e.g. a renamed .doc); we
 * surface that as file_unsupported with a hint.
 *
 * Dynamic import keeps mammoth off the cold-start critical path for
 * every other resume type. Drivers uploading PDFs / photos shouldn't
 * pay the ~600KB module load.
 */
async function transcodeDocxToText(
  buf: Buffer,
): Promise<
  | { ok: true; text: string }
  | { ok: false; code: "file_unsupported"; error: string }
> {
  try {
    // Dynamic import so mammoth only loads when a driver actually
    // submits a .docx.
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    const text = value.trim();
    if (text.length < 20) {
      return {
        ok: false,
        code: "file_unsupported",
        error:
          "DOCX appears empty or unreadable. Try saving as PDF and uploading that instead.",
      };
    }
    return { ok: true, text };
  } catch (err) {
    return {
      ok: false,
      code: "file_unsupported",
      error: `DOCX could not be read (${err instanceof Error ? err.message : String(err)}). Try saving as PDF instead.`,
    };
  }
}
