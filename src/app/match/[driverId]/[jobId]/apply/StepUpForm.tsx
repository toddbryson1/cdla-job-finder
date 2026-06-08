"use client";

import { useActionState } from "react";
import { sendStepUp, verifyStepUp, type StepUpState } from "./actions";

const INITIAL: StepUpState = { phase: "idle" };

export function StepUpForm({
  driverId,
  jobId,
  maskedPhone,
}: {
  driverId: string;
  jobId: string;
  maskedPhone: string;
}) {
  const sendBound = sendStepUp.bind(null, driverId, jobId);
  const verifyBound = verifyStepUp.bind(null, driverId, jobId);

  const [sendState, sendAction, sending] = useActionState(sendBound, INITIAL);
  const [verifyState, verifyAction, verifying] = useActionState(
    verifyBound,
    INITIAL,
  );

  // Once a code has been sent, show the code-entry form. A verify attempt
  // that fails keeps phase "sent" so the input stays up.
  const codeSent = sendState.phase === "sent" || verifyState.phase === "sent";

  return (
    <div className="rounded-lg border border-brand-rule bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-brand-ink">
        Quick security check
      </h2>
      <p className="mt-2 text-sm leading-6 text-brand-muted">
        Before a carrier sees your information, we verify it&rsquo;s really you
        with a one-time code texted to{" "}
        <span className="font-medium text-brand-ink">{maskedPhone}</span>.
      </p>

      {!codeSent ? (
        <form action={sendAction} className="mt-5">
          {sendState.phase === "error" && sendState.error ? (
            <p className="mb-3 text-sm text-red-600">{sendState.error}</p>
          ) : null}
          <button
            type="submit"
            disabled={sending}
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium disabled:opacity-60"
          >
            {sending ? "Sending…" : "Text me a code"}
          </button>
        </form>
      ) : (
        <form action={verifyAction} className="mt-5 space-y-3">
          <label
            htmlFor="stepup-code"
            className="block text-sm font-medium text-brand-ink"
          >
            Enter the 6-digit code
          </label>
          <input
            id="stepup-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            required
            className="block w-40 rounded-md border border-brand-rule bg-brand-paper px-3 py-2.5 text-lg tracking-widest text-brand-ink shadow-sm focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30"
          />
          {verifyState.phase !== "idle" && verifyState.error ? (
            <p className="text-sm text-red-600">{verifyState.error}</p>
          ) : null}
          <div className="flex items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={verifying}
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium disabled:opacity-60"
            >
              {verifying ? "Verifying…" : "Verify & continue"}
            </button>
            <button
              type="submit"
              formAction={sendAction}
              disabled={sending}
              className="text-sm font-medium text-brand-medium underline hover:text-brand-deep disabled:opacity-60"
            >
              Resend code
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
