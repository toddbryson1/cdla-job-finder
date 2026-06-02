"use client";

// Debbie's Stage 1 intake chat surface. Replaces the static
// DebbieChatScaffold on the homepage. Drives the conversation client-
// side (history + state + fields), calls /api/debbie/intake on each
// driver message, and posts to /api/intake at consent time.
//
// Spec: SPEC_conversational-ai-intake-v1.md §3.1 + §4 + §8.1.
//
// Persistence: state survives reload via sessionStorage so a refresh
// mid-conversation doesn't drop the driver. Cleared on intake submit.
//
// What's deferred to a later session:
//   - Audio input (mic icon) — spec §6
//   - Resume upload (paperclip icon) — spec §7
//   - Match render IN chat — for now we redirect to /matches/[id]
//     when intake POST resolves, same as the form fallback
//   - Confirmation step's "playback" is enforced by the LLM via
//     prompt, but the rendering is just the same chat surface

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EMPTY_FIELDS,
  scheduleToHomeTime,
  type DebbieIntakeFields,
  type DebbieIntakeMessage,
  type DebbieIntakeState,
} from "@/lib/debbie/intake-types";
import {
  ASYNC_FALLBACK_TIMEOUT_MS,
  buildMatchesPreamble,
  buildZeroMatchesMessage,
  buildAsyncFallbackMessage,
  type DebbieMatchView,
} from "@/lib/debbie/match-render";

const STORAGE_KEY = "cdla:debbie:intake:v1";

const OPENING_MESSAGES: string[] = [
  "Hey — I'm Debbie. I match Class A drivers to carriers based on what you actually want.",
  "I'm AI, not a recruiter. Five quick questions, then I'll show you who's hiring drivers like you.",
  "What's your home zip?",
];

// Fields the matching engine needs that Debbie doesn't ask in Stage 1.
// We supply permissive defaults so a Stage-1 driver matches every
// equipment type and every region — they can narrow later at /apply.
// All 12 equipment slugs from intake-schema.ts.
const ALL_EQUIPMENT: string[] = [
  "reefer",
  "dry-van",
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
];

interface StoredState {
  messages: DebbieIntakeMessage[];
  state: DebbieIntakeState;
  fields: DebbieIntakeFields;
}

function loadStored(): StoredState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (!Array.isArray(parsed.messages) || !parsed.state) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStored(s: StoredState) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode — ignore */
  }
}

function clearStored() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// Local-only state for the post-consent match phase. Distinct from
// the LLM conversation state so the LLM doesn't think it can extract
// fields once we've moved past consent.
type MatchPhase =
  | "idle" // pre-consent or consent in flight
  | "pending" // matching engine running, within the 5s window
  | "async" // 5s elapsed; will still render matches if they arrive
  | "shown" // matches arrived (any count); render in chat
  | "error"; // matching engine failed; fall back to /matches link

// Audio recording state for the mic button. "denied" sticks once the
// browser blocks getUserMedia so we hide the mic for the rest of the
// session — re-prompting after a deny is annoying and rarely useful.
type AudioState =
  | "idle"
  | "starting" // getUserMedia in flight
  | "recording" // MediaRecorder active
  | "transcribing" // POSTing blob to /api/debbie/transcribe
  | "denied"; // user blocked mic; hide button for the session

interface DebbieIntakeChatProps {
  /**
   * Whether the audio mic button should render. Set by the server
   * component based on DEBBIE_AUDIO_ENABLED. When false, the input
   * row is text-only — same as before audio shipped.
   */
  audioEnabled: boolean;
}

export function DebbieIntakeChat({ audioEnabled }: DebbieIntakeChatProps) {
  const [messages, setMessages] = useState<DebbieIntakeMessage[]>([]);
  const [state, setState] = useState<DebbieIntakeState>("Q1_zip");
  const [fields, setFields] = useState<DebbieIntakeFields>(EMPTY_FIELDS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [matchPhase, setMatchPhase] = useState<MatchPhase>("idle");
  const [matches, setMatches] = useState<DebbieMatchView[]>([]);
  const [driverId, setDriverId] = useState<string | null>(null);
  const [homeLocation, setHomeLocation] = useState<{
    city: string | null;
    state: string | null;
  }>({ city: null, state: null });
  const [audioState, setAudioState] = useState<AudioState>("idle");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Hydrate from sessionStorage on mount.
  useEffect(() => {
    const stored = loadStored();
    if (stored && stored.messages.length > 0) {
      setMessages(stored.messages);
      setState(stored.state);
      setFields(stored.fields);
    }
  }, []);

  // Persist on every meaningful change.
  useEffect(() => {
    if (messages.length === 0) return;
    saveStored({ messages, state, fields });
  }, [messages, state, fields]);

  // Auto-scroll on new messages.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, state]);

  const onSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setError(null);
      const nextMessages: DebbieIntakeMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      setMessages(nextMessages);
      setInput("");
      setBusy(true);
      try {
        const res = await fetch("/api/debbie/intake", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            state,
            conversation: nextMessages,
            fields,
          }),
        });
        const body = (await res.json()) as {
          assistantMessage?: string;
          nextState?: DebbieIntakeState;
          fields?: DebbieIntakeFields;
          error?: string;
        };
        if (!res.ok) {
          setError(body.error ?? "Something glitched. Try again.");
          // Roll back the user message so they can edit it
          setMessages(messages);
          return;
        }
        if (!body.assistantMessage || !body.nextState || !body.fields) {
          setError("Debbie sent back something weird. Try again.");
          setMessages(messages);
          return;
        }
        setMessages([
          ...nextMessages,
          { role: "assistant", content: body.assistantMessage },
        ]);
        setFields(body.fields);
        setState(body.nextState);
      } catch {
        setError("Couldn't reach Debbie. Check your connection and try again.");
        setMessages(messages);
      } finally {
        setBusy(false);
      }
    },
    [fields, messages, state],
  );

  // Mic-button push-to-talk. First click starts recording (asks for
  // mic permission on the first use of the session). Second click
  // stops, posts the blob to /api/debbie/transcribe, and dumps the
  // transcript into the input field for the driver to review + send.
  //
  // We deliberately DON'T auto-send the transcript — spec §6.1 + §6.3
  // require driver review before send so transcription errors don't
  // poison matching.
  const onMicClick = useCallback(async () => {
    if (audioState === "recording") {
      // Stop path. The MediaRecorder.onstop handler does the rest
      // (POSTing the blob, populating the input). Tearing the stream
      // tracks down keeps the browser tab indicator from glowing red.
      mediaRecorderRef.current?.stop();
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      mediaStreamRef.current = null;
      return;
    }
    if (audioState !== "idle") return;
    setError(null);
    setAudioState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // webm/opus is the default browser MediaRecorder mime — Whisper
      // accepts it natively, no transcoding step.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";
      const mr = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mr.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        setAudioState("transcribing");
        try {
          const res = await fetch("/api/debbie/transcribe", {
            method: "POST",
            headers: { "content-type": mimeType },
            body: blob,
          });
          const body = (await res.json()) as {
            ok?: boolean;
            text?: string;
            error?: string;
          };
          if (body.ok && typeof body.text === "string" && body.text.length > 0) {
            setInput((prev) => (prev ? `${prev} ${body.text}` : body.text!));
          } else {
            setError(body.error ?? "Couldn't transcribe that. Try typing.");
          }
        } catch {
          setError("Couldn't reach the transcription server. Try typing.");
        } finally {
          setAudioState("idle");
        }
      };
      mr.start();
      mediaRecorderRef.current = mr;
      setAudioState("recording");
    } catch (err) {
      // Most common case: user clicked "Block" on the browser prompt.
      // Stick to "denied" so we hide the mic for the rest of the
      // session rather than re-prompting on every click.
      console.warn("[debbie] mic getUserMedia failed:", err);
      setAudioState("denied");
      setError(
        "Mic access blocked. You can still type your answer — or change site permissions in your browser settings.",
      );
    }
  }, [audioState]);

  const onSubmitConsent = useCallback(async () => {
    if (!consentChecked || submitting) return;
    if (
      !fields.homeZip ||
      fields.experienceYears == null ||
      !fields.schedule ||
      fields.terminatedLastJob == null ||
      !fields.sapStatus
    ) {
      setError(
        "Hmm — I don't have everything I need yet. Try answering Debbie's last question first.",
      );
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Build the intake-schema POST. Defaults are permissive (all
      // equipment, all regions) so Debbie-flow drivers see the
      // broadest possible match set; they refine at /apply.
      const cdlState = await lookupStateFromZip(fields.homeZip);
      const failedDotTest = fields.sapStatus !== "not-in-sap";
      const intakePayload = {
        firstName: null,
        lastName: null,
        email: null,
        phone: null,
        hasClassA: true,
        cdlState: cdlState ?? "TX", // fallback for unknown zips — matching uses lat/lng anyway
        homeZip: fields.homeZip,
        yearsHeld: fields.experienceYears,
        equipmentRun: ALL_EQUIPMENT,
        endorsements: [],
        otrYears: fields.experienceYears,
        totalCareerExperienceMonths: Math.round(fields.experienceYears * 12),
        monthsSinceLastDrove: 0,
        desiredEquipment: ALL_EQUIPMENT,
        desiredRegions: ["any"],
        homeTime: scheduleToHomeTime(fields.schedule),
        minWeeklyPay: 0,
        willingToRelocate: false,
        accidents3yrCount: 0,
        accidentsDetails: "",
        tickets3yrCount: 0,
        duiEver: false,
        duiMostRecentDate: "",
        felonyEver: false,
        felonyDetails: "",
        terminatedFromAnyOfLast3Employers: fields.terminatedLastJob,
        terminationDetails: fields.terminationReason ?? "",
        failedDotTest,
        sapStatus: fields.sapStatus,
        attestAccurate: true,
        consentToShare: false,
        smsOptIn,
      };
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(intakePayload),
      });
      const body = (await res.json()) as {
        ok?: boolean;
        driverId?: string;
        error?: string;
      };
      if (!res.ok || !body.ok || !body.driverId) {
        setError(
          body.error ??
            "Couldn't save your intake. Try the form fallback instead.",
        );
        setSubmitting(false);
        return;
      }
      clearStored();
      setDriverId(body.driverId);

      // Look up the driver's home city/state for the matches preamble.
      // Best-effort — the preamble works without it (just drops the
      // "near X, Y" suffix).
      const cityState = await lookupCityStateFromZip(fields.homeZip);
      setHomeLocation(cityState);

      // Race the match engine against the 5-second async-fallback
      // timeout per spec §4.5. The fetch keeps running in the
      // background; if it lands after the timeout, we still surface
      // the cards inline so a driver still on the page gets the
      // payoff. If matching errors we fall back to /matches.
      void runMatchInline(body.driverId, cityState);
      setSubmitting(false);
    } catch {
      setError("Couldn't reach the matching server. Try again in a moment.");
      setSubmitting(false);
    }
  }, [consentChecked, fields, smsOptIn, submitting]);

  // Fetch /api/match with a 5-second timer for the async fallback
  // message. The fetch promise stays in flight even after the timer
  // wins — if matches come back during the same session, we still
  // render them inline so the driver doesn't have to refresh.
  const runMatchInline = useCallback(
    async (
      forDriverId: string,
      where: { city: string | null; state: string | null },
    ) => {
      setMatchPhase("pending");
      setMatches([]);

      const matchPromise = fetch("/api/match", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ driverId: forDriverId }),
      })
        .then(async (res) => {
          if (!res.ok) throw new Error(`match ${res.status}`);
          return (await res.json()) as { matches?: Array<Record<string, unknown>> };
        })
        .then((body) => normalizeMatches(body.matches ?? []));

      const timeoutPromise = new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), ASYNC_FALLBACK_TIMEOUT_MS),
      );

      const first = await Promise.race([matchPromise, timeoutPromise]);

      if (first === "timeout") {
        // Show the async fallback; keep awaiting the fetch.
        const asyncMsg = buildAsyncFallbackMessage(false); // anonymous intake — no email
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: asyncMsg },
        ]);
        setMatchPhase("async");

        try {
          const arrived = await matchPromise;
          // Engine eventually came through. Append the matches.
          const preamble = buildMatchesPreamble(
            arrived.length,
            where.city,
            where.state,
          );
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: preamble },
          ]);
          setMatches(arrived);
          setMatchPhase("shown");
        } catch {
          // Async + fetch error. The driver still has the async copy;
          // just give them a manual link to /matches in case the
          // engine catches up later.
          setMatchPhase("error");
        }
        return;
      }

      // Fast path — match resolved before the timer.
      const arrived = first;
      const preamble = buildMatchesPreamble(
        arrived.length,
        where.city,
        where.state,
      );
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: preamble },
      ]);
      setMatches(arrived);
      setMatchPhase("shown");
    },
    [],
  );

  const showConsent = state === "consent_ready";
  const showOpening = messages.length === 0;

  return (
    <div className="relative z-10 overflow-hidden rounded-2xl border border-brand-rule bg-brand-paper shadow-[0_8px_24px_rgba(14,30,51,0.08),_0_24px_64px_rgba(14,30,51,0.10)]">
      <header className="flex items-center gap-3 border-b border-brand-rule bg-brand-surface px-5 py-4">
        <div
          aria-hidden="true"
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-deep font-display text-lg font-semibold text-brand-paper"
        >
          D
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-brand-ink">Debbie</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-brand-muted">
            <span
              aria-hidden="true"
              className="h-[7px] w-[7px] animate-brand-pulse rounded-full bg-brand-ok"
            />
            AI driver matcher · online
          </p>
        </div>
      </header>

      <div
        ref={scrollerRef}
        className="flex max-h-[420px] min-h-[280px] flex-col gap-3.5 overflow-y-auto px-5 py-6"
      >
        {showOpening
          ? OPENING_MESSAGES.map((m, i) => (
              <BotMessage key={`opening-${i}`} delay={i * 0.4}>
                {m}
              </BotMessage>
            ))
          : messages.map((m, i) =>
              m.role === "assistant" ? (
                <BotMessage key={i}>{m.content}</BotMessage>
              ) : (
                <UserMessage key={i}>{m.content}</UserMessage>
              ),
            )}
        {busy ? <TypingIndicator /> : null}
        {showConsent ? (
          <ConsentCard
            checked={consentChecked}
            onCheckedChange={setConsentChecked}
            smsOptIn={smsOptIn}
            onSmsOptInChange={setSmsOptIn}
            submitting={submitting}
            onSubmit={onSubmitConsent}
            audioEnabled={audioEnabled}
          />
        ) : null}
        {matchPhase === "pending" ? <TypingIndicator /> : null}
        {matches.length > 0 && driverId ? (
          <MatchesStack matches={matches} driverId={driverId} />
        ) : null}
        {matchPhase === "shown" && matches.length === 0 ? (
          <ZeroMatchesCallout
            homeCity={homeLocation.city}
            homeState={homeLocation.state}
          />
        ) : null}
        {matchPhase === "error" && driverId ? (
          <MatchErrorCallout driverId={driverId} />
        ) : null}
      </div>

      {error ? (
        <div className="border-t border-brand-rule bg-brand-surface px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showConsent || matchPhase !== "idle" ? null : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSend(input);
          }}
          className="flex items-center gap-2.5 border-t border-brand-rule bg-brand-paper px-4 py-3.5"
        >
          {audioEnabled && audioState !== "denied" ? (
            <MicButton state={audioState} onClick={onMicClick} />
          ) : null}
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="text"
            placeholder={
              audioState === "recording"
                ? "Listening…"
                : audioState === "transcribing"
                  ? "Transcribing…"
                  : showOpening
                    ? "Type your zip…"
                    : "Type your answer…"
            }
            aria-label="Message Debbie"
            disabled={busy || audioState === "transcribing"}
            className="flex-1 border-none bg-transparent px-1 py-2 text-[15.5px] text-brand-ink outline-none placeholder:text-brand-muted disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim() || audioState === "transcribing"}
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-brand-gold text-brand-ink transition-colors hover:bg-brand-gold-soft active:scale-95 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </form>
      )}
      <p className="px-5 pb-4 text-xs leading-5 text-brand-muted">
        Voice + resume upload coming soon.{" "}
        <Link href="/intake" className="underline hover:text-brand-ink">
          Use the form instead
        </Link>{" "}
        if you'd rather type than chat.
      </p>
    </div>
  );
}

// Voice-processing disclosure — renders in the Stage 1 consent card
// when audio is enabled, hidden otherwise. Per spec §6.5: audio
// processing introduces voice/biometric data handling that requires
// state-level BIPA / CUBI / WA disclosure language.
//
// ⚠ ATTORNEY REVIEW PENDING (spec §12). This copy is a developer-
// drafted placeholder intended for counsel revision before the
// DEBBIE_AUDIO_ENABLED flag flips to true in production. Specific
// points the spec calls out that need counsel decisions:
//
//   1. Whether to name OpenAI Whisper as the third-party service
//      explicitly (we do — biometric statutes generally favor
//      naming the processor).
//   2. State-specific consent-vs-notice framing for IL / TX / WA
//      residents — BIPA requires written informed consent for
//      biometric collection; the "voice processed for transcription
//      only, not retained" framing may avoid the biometric-data
//      classification but counsel decides.
//   3. Whether to gate behind a separate unchecked checkbox (like
//      the SMS opt-in) or carry under the existing matching consent.
//      We chose plain-text disclosure for now — flag for counsel.
//   4. Retention language — OpenAI's standard policy does not retain
//      Whisper audio, but the disclosure should pin this in case the
//      provider changes terms.
function VoiceProcessingDisclosure() {
  return (
    <div className="mt-3 rounded-md border border-brand-rule bg-brand-paper p-3 text-[12.5px] leading-5 text-brand-muted">
      <p>
        <strong className="text-brand-ink">Voice input.</strong> If you tap
        the mic, your audio is sent to OpenAI&rsquo;s Whisper service for
        transcription only. Neither CDLA.jobs nor OpenAI keeps the
        recording. You review every transcript before sending. You can
        always type instead.
      </p>
    </div>
  );
}

// Mic button — push-to-talk for the spec §6 audio input. Three visible
// states beyond hidden: idle (mic icon), recording (red pulsing stop
// square), transcribing (small spinner). Click toggles between idle
// and recording; transcribing is a transient post-stop state.
//
// We deliberately don't render this button when audioEnabled prop is
// false (counsel hasn't cleared the BIPA/CUBI/WA disclosure language)
// or when the browser blocked mic access ("denied" state). The button
// component itself never has to know about that — the parent decides
// whether to render it at all.
function MicButton({
  state,
  onClick,
}: {
  state: AudioState;
  onClick: () => void;
}) {
  const isRecording = state === "recording";
  const isBusy = state === "starting" || state === "transcribing";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isRecording ? "Stop recording" : "Start voice input"}
      title={isRecording ? "Tap to stop recording" : "Tap to talk"}
      disabled={isBusy}
      className={
        "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-50 " +
        (isRecording
          ? "bg-red-600 text-white hover:bg-red-700 animate-brand-pulse"
          : "bg-brand-surface text-brand-muted hover:bg-brand-rule hover:text-brand-deep")
      }
    >
      {isRecording ? (
        // Stop square
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="h-3.5 w-3.5"
        >
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      ) : isBusy ? (
        // Spinner (CSS animate-spin from tailwind defaults)
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
          className="h-4 w-4 animate-spin"
        >
          <path d="M12 3a9 9 0 1 0 9 9" />
        </svg>
      ) : (
        // Mic icon
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="h-4 w-4"
        >
          <rect x="9" y="3" width="6" height="12" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      )}
    </button>
  );
}

function BotMessage({
  children,
  delay,
}: {
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className="max-w-[88%] animate-msg-in self-start rounded-2xl rounded-bl-md bg-brand-surface px-4 py-3 text-[15.5px] leading-6 text-brand-ink"
      style={delay != null ? { animationDelay: `${delay}s` } : undefined}
    >
      {children}
    </div>
  );
}

function UserMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[88%] animate-msg-in self-end rounded-2xl rounded-br-md bg-brand-deep px-4 py-3 text-[15.5px] leading-6 text-brand-paper">
      {children}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="max-w-[60px] self-start rounded-2xl rounded-bl-md bg-brand-surface px-4 py-3">
      <span className="inline-flex gap-1">
        <Dot delay={0} />
        <Dot delay={0.15} />
        <Dot delay={0.3} />
      </span>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-brand-pulse rounded-full bg-brand-muted"
      style={{ animationDelay: `${delay}s`, animationDuration: "1s" }}
    />
  );
}

function ConsentCard({
  checked,
  onCheckedChange,
  smsOptIn,
  onSmsOptInChange,
  submitting,
  onSubmit,
  audioEnabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  smsOptIn: boolean;
  onSmsOptInChange: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
  audioEnabled: boolean;
}) {
  return (
    <div className="self-stretch rounded-2xl border border-brand-rule bg-brand-paper p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-brand-ink">
        One last step before I show you matches.
      </h3>
      <p className="mt-2 text-[13.5px] leading-6 text-brand-muted">
        I'll store what you told me and run it against carriers in our
        system. You'll see your matches next. We don't share your info
        with any specific carrier until you pick one.
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-brand-rule bg-brand-surface p-3 text-[13.5px] leading-6 text-brand-ink">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
          className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-deep"
        />
        <span>
          I understand CDLA.jobs will store my answers and match me against
          carriers in their system. I can ask CDLA.jobs to delete my data
          at any time.
        </span>
      </label>
      <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-md border border-brand-rule bg-brand-paper p-3 text-[13.5px] leading-6 text-brand-ink">
        <input
          type="checkbox"
          checked={smsOptIn}
          onChange={(e) => onSmsOptInChange(e.target.checked)}
          className="mt-1 h-4 w-4 flex-shrink-0 accent-brand-deep"
        />
        <span>
          Text me when carriers like the ones in my matches start hiring.
          Reply STOP any time to opt out. <em>Optional.</em>
        </span>
      </label>
      {audioEnabled ? <VoiceProcessingDisclosure /> : null}
      <button
        type="button"
        onClick={onSubmit}
        disabled={!checked || submitting}
        className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-brand-paper transition-colors hover:bg-brand-medium disabled:opacity-50"
      >
        {submitting ? "Running your match…" : "Run my match"}
      </button>
    </div>
  );
}

// Stack of compact carrier cards rendered after the matches preamble
// bubble. Sized to fit inside the chat bubble layout (max ~88% width)
// while still being scannable. Each card links to /match/[driverId]/
// [jobId]/apply — the same Stage 2 entry point as the form-fallback
// /matches page uses.
function MatchesStack({
  matches,
  driverId,
}: {
  matches: DebbieMatchView[];
  driverId: string;
}) {
  return (
    <div className="self-stretch animate-msg-in space-y-2.5">
      {matches.map((m) => (
        <MatchCard key={m.jobId} match={m} driverId={driverId} />
      ))}
      <Link
        href={`/matches/${driverId}`}
        className="block text-center text-xs font-medium text-brand-medium hover:text-brand-deep"
      >
        See all matches in detail →
      </Link>
    </div>
  );
}

function MatchCard({
  match,
  driverId,
}: {
  match: DebbieMatchView;
  driverId: string;
}) {
  const cityState =
    match.domicileCity && match.domicileState
      ? `${match.domicileCity}, ${match.domicileState}`
      : match.domicileState || match.domicileCity || null;
  return (
    <div className="rounded-xl border border-brand-rule bg-brand-surface p-3.5 shadow-sm">
      <p className="text-sm font-semibold text-brand-ink">
        {match.carrierName}
      </p>
      <p className="mt-0.5 text-[13px] leading-5 text-brand-muted">
        {match.positionTitle}
      </p>
      <dl className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] leading-5 text-brand-ink">
        {match.equipmentLabel ? (
          <span>
            <span className="text-brand-muted">Equipment</span>{" "}
            {match.equipmentLabel}
          </span>
        ) : null}
        {cityState ? (
          <span>
            <span className="text-brand-muted">Out of</span> {cityState}
          </span>
        ) : null}
        {match.payRangeLabel ? (
          <span>
            <span className="text-brand-muted">Pay</span>{" "}
            {match.payRangeLabel}
          </span>
        ) : null}
      </dl>
      <Link
        href={`/match/${driverId}/${match.jobId}/apply`}
        className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-brand-deep px-4 text-xs font-semibold text-brand-paper transition-colors hover:bg-brand-medium"
      >
        Apply with {match.carrierName}
      </Link>
    </div>
  );
}

// Spec §4.5: Zero matches is honest, not pivoting to false hope. The
// driver is in nurture (Stage 1 consent covered it) so we lead with
// the email-when-something-fits promise. For anonymous drivers we
// don't have an email yet, so the language is gentler — "I'll let you
// know" rather than "I'll email you."
function ZeroMatchesCallout({
  homeCity,
  homeState,
}: {
  homeCity: string | null;
  homeState: string | null;
}) {
  const where =
    homeCity && homeState
      ? `near ${homeCity}, ${homeState}`
      : homeState
        ? `in ${homeState}`
        : null;
  return (
    <div className="self-stretch animate-msg-in rounded-xl border border-brand-rule bg-brand-surface p-4">
      <p className="text-sm leading-6 text-brand-ink">
        Nothing matches that exactly right now{where ? ` ${where}` : ""}. New
        carriers are joining and posting positions all the time — could be a
        day, could be a couple weeks.
      </p>
    </div>
  );
}

function MatchErrorCallout({ driverId }: { driverId: string }) {
  return (
    <div className="self-stretch animate-msg-in rounded-xl border border-brand-rule bg-brand-surface p-4">
      <p className="text-sm leading-6 text-brand-ink">
        The matching engine got stuck on my end. Your intake saved fine —
        head to{" "}
        <Link
          href={`/matches/${driverId}`}
          className="font-semibold text-brand-deep underline hover:text-brand-medium"
        >
          your matches page
        </Link>{" "}
        and try again in a minute.
      </p>
    </div>
  );
}

// Best-effort zip→state lookup. /api/intake's server-side check uses
// the zip_codes table too — this just gets us a passable cdlState
// upfront so the POST validates. If lookup fails the server still
// rejects the intake (and we surface that as an error).
async function lookupStateFromZip(zip: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/debbie/zip-state?zip=${encodeURIComponent(zip)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { state?: string };
    return typeof body.state === "string" && body.state.length === 2
      ? body.state.toUpperCase()
      : null;
  } catch {
    return null;
  }
}

// Same endpoint as lookupStateFromZip, but returns both city + state
// for the matches preamble ("near Atlanta, GA"). Defensive nulls when
// the zip isn't in our table.
async function lookupCityStateFromZip(
  zip: string,
): Promise<{ city: string | null; state: string | null }> {
  try {
    const res = await fetch(`/api/debbie/zip-state?zip=${encodeURIComponent(zip)}`);
    if (!res.ok) return { city: null, state: null };
    const body = (await res.json()) as { state?: string; city?: string };
    return {
      city: typeof body.city === "string" ? body.city : null,
      state:
        typeof body.state === "string" && body.state.length === 2
          ? body.state.toUpperCase()
          : null,
    };
  } catch {
    return { city: null, state: null };
  }
}

// Convert the matching-engine's Match objects (lots of fields, types
// imported from the matching module) into the slim DebbieMatchView
// the chat renders. Defensive — bad-shape rows are dropped silently.
function normalizeMatches(rows: Array<Record<string, unknown>>): DebbieMatchView[] {
  const out: DebbieMatchView[] = [];
  for (const r of rows) {
    const jobId = typeof r.jobId === "string" ? r.jobId : null;
    const carrierName =
      typeof r.carrierName === "string" ? r.carrierName : null;
    if (!jobId || !carrierName) continue;
    out.push({
      jobId,
      carrierName,
      positionTitle:
        typeof r.positionTitle === "string" ? r.positionTitle : "Driver",
      equipmentLabel: equipmentLabelFromUnknown(r.equipment),
      domicileCity:
        typeof r.domicileCity === "string" ? r.domicileCity : "",
      domicileState:
        typeof r.domicileState === "string" ? r.domicileState : "",
      distanceMiles:
        typeof r.distanceMilesFromDriverHome === "number"
          ? r.distanceMilesFromDriverHome
          : null,
      payRangeLabel: payRangeLabelFromUnknown(
        r.payRangeMinWeekly,
        r.payRangeMaxWeekly,
      ),
      carrierKind:
        r.carrierKind === "partner" ||
        r.carrierKind === "prospect" ||
        r.carrierKind === "subscription"
          ? r.carrierKind
          : "prospect",
      carrierTier:
        r.carrierTier === "tier_1" ||
        r.carrierTier === "tier_2" ||
        r.carrierTier === "none"
          ? r.carrierTier
          : "none",
      label: typeof r.label === "string" ? r.label : "",
    });
  }
  return out;
}

function equipmentLabelFromUnknown(v: unknown): string {
  if (typeof v !== "string") return "";
  // Reuse the same pretty-label dictionary as match-render.ts
  // through a local copy — the helper isn't exported there to keep
  // intake-types.ts dependency-free.
  const map: Record<string, string> = {
    "dry-van": "Dry Van",
    reefer: "Reefer",
    flatbed: "Flatbed",
    tanker: "Tanker",
    hazmat: "Hazmat",
    "auto-hauler": "Auto Hauler",
    doubles: "Doubles",
    triples: "Triples",
    oversized: "Heavy Haul",
    dump: "Dump",
    mixer: "Mixer",
    intermodal: "Intermodal",
  };
  const k = v.toLowerCase().trim();
  return (
    map[k] ??
    k
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ")
  );
}

function payRangeLabelFromUnknown(
  min: unknown,
  max: unknown,
): string | null {
  const mn = typeof min === "number" ? min : null;
  const mx = typeof max === "number" ? max : null;
  if (mn != null && mx != null)
    return `$${mn.toLocaleString()}–$${mx.toLocaleString()}/wk`;
  if (mx != null) return `Up to $${mx.toLocaleString()}/wk`;
  if (mn != null) return `From $${mn.toLocaleString()}/wk`;
  return null;
}
