"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  driverId: string;
  jobId: string;
  carrierName: string;
  positionTitle: string;
  open: boolean;
  onClose: () => void;
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const OPENING: Message = {
  role: "assistant",
  content:
    "I'm Debbie, the AI driver matcher at CDLA.jobs. Ask me anything about this job — pay, lanes, home time, what the carrier expects on safety, what to know before applying. I'll answer with what's in the listing; if the carrier didn't say, I'll tell you that too.",
};

export function AskDebbie({
  driverId,
  jobId,
  carrierName,
  positionTitle,
  open,
  onClose,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([OPENING]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, pending]);

  // Focus input when modal opens
  useEffect(() => {
    if (open && inputRef.current) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  async function send() {
    const q = draft.trim();
    if (!q || pending) return;
    setDraft("");
    setError(null);

    const userMessage: Message = { role: "user", content: q };
    // Exclude the opening message from what we send to the API — that's
    // a static client greeting, not part of the Anthropic conversation.
    const apiConversation = [...messages.slice(1), userMessage];
    setMessages((m) => [...m, userMessage]);
    setPending(true);

    try {
      const res = await fetch("/api/debbie/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId,
          jobId,
          conversation: apiConversation,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
      };
      if (!res.ok || !body.answer) {
        setError(
          body.error ??
            "Debbie hit a snag. Try again, or refresh the page if it sticks.",
        );
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: body.answer! }]);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="ask-debbie-title"
    >
      <div
        className="flex h-[90vh] w-full max-w-xl flex-col rounded-t-2xl bg-white shadow-xl sm:h-[600px] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-brand-rule px-4 py-3">
          <div
            aria-hidden="true"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-deep text-sm font-semibold text-white"
          >
            D
          </div>
          <div className="min-w-0 flex-1">
            <p
              id="ask-debbie-title"
              className="text-sm font-semibold text-brand-ink"
            >
              Debbie
            </p>
            <p className="truncate text-xs text-brand-muted">
              About {positionTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-brand-muted hover:bg-brand-surface hover:text-brand-ink"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M5 5L15 15M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
        >
          {messages.map((m, i) => (
            <MessageBubble key={i} role={m.role} content={m.content} />
          ))}
          {pending ? <TypingIndicator /> : null}
          {error ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        {/* Input */}
        <div className="border-t border-brand-rule p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Ask about ${carrierName}...`}
              rows={1}
              maxLength={800}
              className="flex-1 resize-none rounded-md border border-brand-rule bg-white px-3 py-2 text-sm leading-6 text-brand-ink shadow-sm focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={pending || draft.trim().length === 0}
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand-deep px-4 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <p className="mt-2 text-[10px] uppercase tracking-wider text-brand-muted">
            Debbie is AI. Answers come from the listing; carriers decide who
            they hire.
          </p>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: "user" | "assistant";
  content: string;
}) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          "max-w-[85%] whitespace-pre-line rounded-2xl px-4 py-2.5 text-sm leading-6 " +
          (isUser
            ? "rounded-tr-md bg-brand-deep text-white"
            : "rounded-tl-md bg-brand-surface text-brand-ink")
        }
      >
        {content}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-tl-md bg-brand-surface px-4 py-3 text-sm text-brand-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-muted [animation-delay:-0.3s]"></span>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-muted [animation-delay:-0.15s]"></span>
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-muted"></span>
        </span>
      </div>
    </div>
  );
}
