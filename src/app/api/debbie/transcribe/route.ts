// POST /api/debbie/transcribe — Whisper transcription for Debbie's
// audio input. Body is the raw audio bytes (audio/webm by default
// from MediaRecorder; audio/mp4/m4a/wav/ogg also accepted).
//
// Feature-flagged on DEBBIE_AUDIO_ENABLED. Until counsel clears the
// BIPA/CUBI/WA biometric disclosure language per spec §6.5 + §12,
// the flag stays unset in prod and this route returns 503. No
// driver's voice ever leaves the browser when the flag is off.
//
// Public route — Stage 1 intake is anonymous by design. Per-request
// rate limit lives at the Vercel / Whisper layer for now.

import { NextResponse } from "next/server";
import {
  isAudioEnabled,
  MAX_AUDIO_BYTES,
  transcribeAudio,
} from "@/lib/debbie/transcribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ACCEPTED_PREFIXES = [
  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/m4a",
  "audio/mp4",
];

export async function POST(request: Request) {
  if (!isAudioEnabled()) {
    return NextResponse.json(
      {
        ok: false,
        code: "not_configured",
        error:
          "Voice input is rolling out gradually — please type for now.",
      },
      { status: 503 },
    );
  }

  const contentType = (
    request.headers.get("content-type") ?? ""
  ).toLowerCase();
  if (!ACCEPTED_PREFIXES.some((p) => contentType.startsWith(p))) {
    return NextResponse.json(
      {
        ok: false,
        code: "audio_invalid",
        error: `Expected an audio/* content-type; got "${contentType}".`,
      },
      { status: 400 },
    );
  }

  // Enforce body-size up front so we don't allocate a huge ArrayBuffer
  // just to reject it after.
  const lengthHeader = Number(request.headers.get("content-length") ?? 0);
  if (lengthHeader > MAX_AUDIO_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        code: "audio_too_large",
        error: `Audio is ${(lengthHeader / 1024 / 1024).toFixed(1)}MB — max is 25MB.`,
      },
      { status: 413 },
    );
  }

  let audio: ArrayBuffer;
  try {
    audio = await request.arrayBuffer();
  } catch {
    return NextResponse.json(
      { ok: false, code: "audio_invalid", error: "Couldn't read audio body." },
      { status: 400 },
    );
  }

  const result = await transcribeAudio(audio, contentType);
  if (!result.ok) {
    // Validation-shaped failures → 400; everything else → 502 so
    // an uptime monitor distinguishes "user sent garbage" from
    // "Whisper / network is broken."
    const status =
      result.code === "audio_too_large" ||
      result.code === "audio_too_small" ||
      result.code === "not_configured"
        ? result.code === "not_configured"
          ? 503
          : 400
        : 502;
    console.error(
      `[debbie/transcribe] code=${result.code} error=${result.error.slice(0, 200)}`,
    );
    return NextResponse.json(
      { ok: false, code: result.code, error: result.error },
      { status },
    );
  }

  console.log(
    `[debbie/transcribe] ok bytes=${audio.byteLength} text_len=${result.text.length}`,
  );
  return NextResponse.json({ ok: true, text: result.text });
}
