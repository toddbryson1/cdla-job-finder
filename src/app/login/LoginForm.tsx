"use client";

import { useActionState } from "react";
import { sendMagicLink, type SendLinkState } from "./actions";

const initialState: SendLinkState = { status: "idle" };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    sendMagicLink,
    initialState,
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-2xl border border-brand-rule bg-white p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-semibold tracking-tight text-brand-ink">
          Check your inbox.
        </h2>
        <p className="mt-3 text-base leading-7 text-brand-ink">
          We sent a link to <span className="font-medium">{state.email}</span>.
          It expires in 15 minutes. Click it on the same device you are reading
          this on.
        </p>
        <p className="mt-3 text-sm text-brand-muted">
          Did not arrive? Check spam. If you used a different email when you
          signed up, try that one.
        </p>
      </div>
    );
  }

  return (
    <form
      action={formAction}
      className="rounded-2xl border border-brand-rule bg-white p-6 sm:p-8 shadow-sm"
    >
      <label className="block">
        <span className="block text-sm font-medium text-brand-ink">
          Email address
        </span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          inputMode="email"
          autoFocus
          placeholder="you@example.com"
          className="mt-1.5 block w-full rounded-md border border-brand-rule bg-white px-3 py-2.5 text-base text-brand-ink shadow-sm placeholder:text-brand-muted/70 focus:border-brand-medium focus:outline-none focus:ring-2 focus:ring-brand-medium/30"
        />
      </label>
      {state.status === "error" && state.error ? (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium disabled:opacity-60 transition-colors"
      >
        {pending ? "Sending..." : "Send my link"}
      </button>
      <p className="mt-3 text-xs text-brand-muted">
        Use the email you gave us when you filled out your intake. No password,
        no account to remember.
      </p>
    </form>
  );
}
