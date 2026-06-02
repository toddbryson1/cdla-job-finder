// POST /api/debbie/parse-resume — paperclip upload endpoint. Body is
// a multipart form with the file field "resume". Returns the LLM-
// extracted fields the client can merge into Debbie's running
// fields state per spec §7.2 (resume is a hint for the conversation,
// not a replacement for the driver's answers).
//
// Feature-flagged on DEBBIE_RESUME_ENABLED (which also requires
// ANTHROPIC_API_KEY). Spec §7.5 + §12 hold the flag off in prod
// until counsel clears the data-flow disclosure language.

import { NextResponse } from "next/server";
import {
  isResumeEnabled,
  MAX_RESUME_BYTES,
  parseResume,
} from "@/lib/debbie/parse-resume";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isResumeEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        code: "not_configured",
        error: "Resume upload is rolling out gradually — please type for now.",
      },
      { status: 503 },
    );
  }

  // Reject huge bodies upfront so we don't allocate to read them.
  const lengthHeader = Number(request.headers.get("content-length") ?? 0);
  if (lengthHeader > MAX_RESUME_BYTES + 2048) {
    return NextResponse.json(
      {
        ok: false,
        code: "file_too_large",
        error: `Resume is ${(lengthHeader / 1024 / 1024).toFixed(1)}MB — max is 5MB.`,
      },
      { status: 413 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "file_unsupported",
        error: "Expected multipart/form-data with a file field 'resume'.",
      },
      { status: 400 },
    );
  }

  const file = formData.get("resume");
  if (!(file instanceof File)) {
    return NextResponse.json(
      {
        ok: false,
        code: "file_unsupported",
        error: "Missing the 'resume' file field.",
      },
      { status: 400 },
    );
  }

  const buffer = await file.arrayBuffer();
  const result = await parseResume(buffer, file.type || "application/octet-stream");

  if (!result.ok) {
    const status =
      result.code === "not_configured"
        ? 503
        : result.code === "rate_limited"
          ? 429
          : result.code === "network" || result.code === "api_error"
            ? 502
            : 400;
    console.error(
      `[debbie/parse-resume] code=${result.code} error=${result.error.slice(0, 200)}`,
    );
    return NextResponse.json(
      { ok: false, code: result.code, error: result.error },
      { status },
    );
  }

  // Log only the field NAMES we extracted — never the values. We don't
  // want resume contents in server logs even at the keys-only level.
  console.log(
    `[debbie/parse-resume] ok extracted=${Object.keys(result.extracted).join(",") || "(none)"}`,
  );
  return NextResponse.json({ ok: true, extracted: result.extracted });
}
