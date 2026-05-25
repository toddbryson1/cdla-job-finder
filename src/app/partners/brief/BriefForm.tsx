"use client";

import { useState } from "react";

const FLEET_SIZES = [
  { value: "1-10", label: "1–10 trucks" },
  { value: "11-50", label: "11–50 trucks" },
  { value: "51-250", label: "51–250 trucks" },
  { value: "250+", label: "250+ trucks" },
] as const;

type Status = "idle" | "submitting" | "ok" | "error";

const labelClass = "block text-sm font-medium text-brand-ink";
const inputClass =
  "mt-1.5 block w-full rounded-md border border-brand-rule bg-white px-3 py-2.5 text-base text-brand-ink shadow-sm placeholder:text-brand-muted/70 focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30";

export function BriefForm() {
  const [fullName, setFullName] = useState("");
  const [carrierName, setCarrierName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [fleetSize, setFleetSize] =
    useState<(typeof FLEET_SIZES)[number]["value"] | "">("");
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submittedEmail, setSubmittedEmail] = useState<string>("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/carrier-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          carrierName,
          email,
          phone,
          fleetSize,
          website,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        email?: string;
        error?: string;
      };
      if (!res.ok || !body.ok) {
        setStatus("error");
        setError(
          body.error ??
            "Something went wrong. Try again in a minute, or email sales@cdla.jobs.",
        );
        return;
      }
      setSubmittedEmail(body.email ?? email);
      setStatus("ok");
    } catch {
      setStatus("error");
      setError("Network error. Try again, or email sales@cdla.jobs.");
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-lg border border-brand-rule bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold text-brand-deep">
          Check your inbox.
        </p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-brand-ink">
          The carrier brief is on its way to{" "}
          <span className="font-mono text-brand-deep">{submittedEmail}</span>.
        </h2>
        <p className="mt-3 text-sm leading-6 text-brand-ink">
          You should see it in a minute or two. If it doesn&rsquo;t arrive,
          check spam, or email{" "}
          <a
            href="mailto:sales@cdla.jobs"
            className="font-medium text-brand-medium underline"
          >
            sales@cdla.jobs
          </a>{" "}
          and we&rsquo;ll send it again.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-lg border border-brand-rule bg-white p-6 sm:p-8"
      noValidate
    >
      {/* Honeypot — hidden from humans, irresistible to bots. */}
      <div
        aria-hidden="true"
        className="absolute -left-[5000px] h-0 w-0 overflow-hidden"
      >
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Your name
          <input
            type="text"
            required
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Carrier or company name
          <input
            type="text"
            required
            autoComplete="organization"
            value={carrierName}
            onChange={(e) => setCarrierName(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Work email
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Phone <span className="text-brand-muted">(optional)</span>
          <input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={inputClass}
          />
        </label>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-brand-ink">
          Fleet size
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FLEET_SIZES.map((opt) => {
            const active = fleetSize === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFleetSize(opt.value)}
                className={
                  "h-11 rounded-md border px-3 text-sm font-medium transition-colors " +
                  (active
                    ? "border-brand-deep bg-brand-deep text-white"
                    : "border-brand-rule bg-white text-brand-ink hover:border-brand-medium")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={
            status === "submitting" ||
            !fullName.trim() ||
            !carrierName.trim() ||
            !email.trim() ||
            !fleetSize
          }
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-medium disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "submitting" ? "Sending..." : "Send me the brief"}
        </button>
        <span className="text-xs text-brand-muted">
          One email with the PDF attached. We don&rsquo;t share your info.
        </span>
      </div>
    </form>
  );
}
