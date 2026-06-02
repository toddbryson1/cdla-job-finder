// Server-side Whisper transcription for Debbie's audio input. Uses
// OpenAI's audio/transcriptions endpoint via raw fetch — no SDK
// dependency. Drivers tap the mic, speak, the audio comes through
// /api/debbie/transcribe, this module sends it to Whisper, returns
// the text to the client for review before send.
//
// FEATURE FLAG (spec §6 + §12):
//   Audio processing introduces voice/biometric data handling. Spec
//   §12 requires attorney review of Stage 1 consent language for
//   BIPA / CUBI / WA biometric law disclosure. Until that clears,
//   DEBBIE_AUDIO_ENABLED stays unset and isAudioEnabled() returns
//   false everywhere — the mic button doesn't render, the POST route
//   returns 503, and no driver's voice ever leaves the browser.
//
// BUDGET: Whisper costs $0.006/min. Stage 1 intake is ~5 questions
// × ~10s each ≈ 50s per driver, so ~$0.005 per audio-using intake.
// Negligible against the conversion lift the spec expects.

const WHISPER_API_URL = "https://api.openai.com/v1/audio/transcriptions";
const WHISPER_MODEL = "whisper-1";

/** Whisper's hard upload limit. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024; // 25 MiB

/**
 * Reject obviously-empty blobs before paying Whisper. 200 bytes is a
 * generous floor — even sub-second recordings exceed this.
 */
export const MIN_AUDIO_BYTES = 200;

export function isAudioEnabled(): boolean {
  const key = process.env.OPENAI_API_KEY;
  const enabled = process.env.DEBBIE_AUDIO_ENABLED;
  return Boolean(key) && enabled === "true";
}

export type TranscribeResultCode =
  | "not_configured"
  | "audio_too_large"
  | "audio_too_small"
  | "api_error"
  | "rate_limited"
  | "network";

export type TranscribeResult =
  | { ok: true; text: string }
  | { ok: false; code: TranscribeResultCode; error: string };

/**
 * Send an audio buffer to Whisper and return the transcript. Defensive
 * against every failure mode the model + network produce — caller can
 * branch cleanly on `code` without re-parsing the error string.
 *
 * The CDLA prompt biases Whisper toward trucker terminology so
 * "reefer" doesn't come back as "refer" and "OTR" stays uppercase.
 * Per OpenAI's docs the prompt is best-effort and won't change the
 * output much, but it costs nothing to try.
 */
export async function transcribeAudio(
  audio: ArrayBuffer | Buffer,
  mimeType: string,
): Promise<TranscribeResult> {
  if (!isAudioEnabled()) {
    return {
      ok: false,
      code: "not_configured",
      error:
        "Audio transcription is disabled (DEBBIE_AUDIO_ENABLED off or OPENAI_API_KEY missing).",
    };
  }

  const buf = audio instanceof ArrayBuffer ? Buffer.from(audio) : audio;

  if (buf.byteLength > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      code: "audio_too_large",
      error: `Audio is ${(buf.byteLength / 1024 / 1024).toFixed(1)}MB — Whisper accepts up to 25MB.`,
    };
  }
  if (buf.byteLength < MIN_AUDIO_BYTES) {
    return {
      ok: false,
      code: "audio_too_small",
      error: "Audio recording is empty or too short.",
    };
  }

  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeType }), `audio.${extFromMime(mimeType)}`);
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "json");
  form.append(
    "prompt",
    "Class A CDL driver intake conversation. Trucking terms: reefer, dry van, flatbed, tanker, OTR, regional, local, dedicated, SAP, DOT, IntelliApp.",
  );

  let res: Response;
  try {
    res = await fetch(WHISPER_API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY!}` },
      body: form,
    });
  } catch (err) {
    return {
      ok: false,
      code: "network",
      error: `Network error reaching Whisper: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      code: "rate_limited",
      error: "Whisper rate limit hit. Try again in a moment.",
    };
  }
  if (!res.ok) {
    const body = await safeReadText(res);
    return {
      ok: false,
      code: "api_error",
      error: `Whisper ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  let bodyJson: unknown;
  try {
    bodyJson = await res.json();
  } catch {
    return {
      ok: false,
      code: "api_error",
      error: "Whisper returned 2xx with unparseable body.",
    };
  }
  const text =
    bodyJson && typeof bodyJson === "object" && "text" in bodyJson
      ? (bodyJson as { text?: unknown }).text
      : null;
  if (typeof text !== "string") {
    return {
      ok: false,
      code: "api_error",
      error: "Whisper response missing text field.",
    };
  }
  return { ok: true, text: text.trim() };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "<unreadable>";
  }
}

/**
 * Extension hint for the multipart filename. Whisper sniffs the file
 * itself so this is mostly cosmetic, but a sane extension helps when
 * a request shows up in OpenAI's dashboard logs.
 */
export function extFromMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("webm")) return "webm";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mp3") || m.includes("mpeg")) return "mp3";
  if (m.includes("wav")) return "wav";
  if (m.includes("m4a")) return "m4a";
  if (m.includes("mp4")) return "mp4";
  return "webm"; // sensible default for browser MediaRecorder
}
