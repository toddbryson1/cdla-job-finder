import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extFromMime,
  isAudioEnabled,
  MAX_AUDIO_BYTES,
  MIN_AUDIO_BYTES,
  transcribeAudio,
} from "@/lib/debbie/transcribe";

describe("extFromMime", () => {
  it("maps browser MediaRecorder defaults correctly", () => {
    expect(extFromMime("audio/webm")).toBe("webm");
    expect(extFromMime("audio/webm;codecs=opus")).toBe("webm");
    expect(extFromMime("audio/ogg")).toBe("ogg");
    expect(extFromMime("audio/mp4")).toBe("mp4");
    expect(extFromMime("audio/mpeg")).toBe("mp3");
    expect(extFromMime("audio/wav")).toBe("wav");
    expect(extFromMime("audio/m4a")).toBe("m4a");
  });

  it("falls back to webm for unrecognized mimes", () => {
    expect(extFromMime("audio/something-weird")).toBe("webm");
    expect(extFromMime("application/octet-stream")).toBe("webm");
  });

  it("is case-insensitive (some MediaRecorder impls send uppercase)", () => {
    expect(extFromMime("AUDIO/WEBM")).toBe("webm");
    expect(extFromMime("Audio/Mp4")).toBe("mp4");
  });
});

describe("isAudioEnabled (feature flag, spec §6.5 + §12)", () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origFlag = process.env.DEBBIE_AUDIO_ENABLED;

  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    if (origFlag === undefined) delete process.env.DEBBIE_AUDIO_ENABLED;
    else process.env.DEBBIE_AUDIO_ENABLED = origFlag;
  });

  it("is false when both env vars are absent (default state — counsel hasn't cleared)", () => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.DEBBIE_AUDIO_ENABLED;
    expect(isAudioEnabled()).toBe(false);
  });

  it("is false when the key is set but the flag is not 'true'", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "false";
    expect(isAudioEnabled()).toBe(false);
  });

  it("is false when the flag is 'true' but no key is present", () => {
    delete process.env.OPENAI_API_KEY;
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    expect(isAudioEnabled()).toBe(false);
  });

  it("is true only when BOTH key is set AND flag is exactly 'true'", () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    expect(isAudioEnabled()).toBe(true);
  });
});

describe("transcribeAudio", () => {
  const origKey = process.env.OPENAI_API_KEY;
  const origFlag = process.env.DEBBIE_AUDIO_ENABLED;

  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    if (origKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = origKey;
    if (origFlag === undefined) delete process.env.DEBBIE_AUDIO_ENABLED;
    else process.env.DEBBIE_AUDIO_ENABLED = origFlag;
  });

  it("returns not_configured when the flag is off (no fetch fired)", async () => {
    delete process.env.DEBBIE_AUDIO_ENABLED;
    const spy = vi.spyOn(global, "fetch");
    const buf = Buffer.alloc(1024);
    const r = await transcribeAudio(buf, "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_configured");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns audio_too_large when buffer exceeds 25MB", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    const spy = vi.spyOn(global, "fetch");
    // Allocate just over the limit
    const buf = Buffer.alloc(MAX_AUDIO_BYTES + 1);
    const r = await transcribeAudio(buf, "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audio_too_large");
    expect(spy).not.toHaveBeenCalled();
  });

  it("returns audio_too_small when buffer is under the floor", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    const spy = vi.spyOn(global, "fetch");
    const buf = Buffer.alloc(MIN_AUDIO_BYTES - 1);
    const r = await transcribeAudio(buf, "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("audio_too_small");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the Authorization header + multipart on 2xx", async () => {
    process.env.OPENAI_API_KEY = "sk-fake-test-key";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ text: "I have 3 years OTR experience." }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const buf = Buffer.alloc(2048);
    const r = await transcribeAudio(buf, "audio/webm");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toBe("I have 3 years OTR experience.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://api.openai.com/v1/audio/transcriptions",
    );
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk-fake-test-key");
    // body should be a FormData
    expect(init!.body).toBeInstanceOf(FormData);
  });

  it("maps 429 to rate_limited", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("rate limit", { status: 429 }),
    );
    const r = await transcribeAudio(Buffer.alloc(2048), "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("rate_limited");
  });

  it("maps 5xx to api_error", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("upstream timeout", { status: 503 }),
    );
    const r = await transcribeAudio(Buffer.alloc(2048), "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("api_error");
  });

  it("maps network errors to network", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const r = await transcribeAudio(Buffer.alloc(2048), "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("network");
      expect(r.error).toContain("ECONNRESET");
    }
  });

  it("maps 2xx missing text field to api_error", async () => {
    process.env.OPENAI_API_KEY = "sk-fake";
    process.env.DEBBIE_AUDIO_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ wrong: "shape" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await transcribeAudio(Buffer.alloc(2048), "audio/webm");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("api_error");
      expect(r.error).toContain("missing text field");
    }
  });
});
