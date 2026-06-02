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
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  EMPTY_FIELDS,
  scheduleToHomeTime,
  type DebbieIntakeFields,
  type DebbieIntakeMessage,
  type DebbieIntakeState,
} from "@/lib/debbie/intake-types";

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

export function DebbieIntakeChat() {
  const router = useRouter();
  const [messages, setMessages] = useState<DebbieIntakeMessage[]>([]);
  const [state, setState] = useState<DebbieIntakeState>("Q1_zip");
  const [fields, setFields] = useState<DebbieIntakeFields>(EMPTY_FIELDS);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
      router.push(`/matches/${body.driverId}`);
    } catch {
      setError("Couldn't reach the matching server. Try again in a moment.");
      setSubmitting(false);
    }
  }, [consentChecked, fields, router, smsOptIn, submitting]);

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
          />
        ) : null}
      </div>

      {error ? (
        <div className="border-t border-brand-rule bg-brand-surface px-5 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {showConsent ? null : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSend(input);
          }}
          className="flex items-center gap-2.5 border-t border-brand-rule bg-brand-paper px-4 py-3.5"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            inputMode="text"
            placeholder={
              showOpening ? "Type your zip…" : "Type your answer…"
            }
            aria-label="Message Debbie"
            disabled={busy}
            className="flex-1 border-none bg-transparent px-1 py-2 text-[15.5px] text-brand-ink outline-none placeholder:text-brand-muted disabled:opacity-50"
          />
          <button
            type="submit"
            aria-label="Send"
            disabled={busy || !input.trim()}
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
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  smsOptIn: boolean;
  onSmsOptInChange: (v: boolean) => void;
  submitting: boolean;
  onSubmit: () => void;
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
