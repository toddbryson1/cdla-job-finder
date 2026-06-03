"use client";

// Root error boundary. Renders when ANY server component or route
// handler under / throws an uncaught error. Replaces Next 16's
// default development error overlay (which is dev-only) and the
// generic minimal "Application error" page (production default).
//
// Strategy: stay calm, stay branded, give the driver a path back to
// somewhere working. Don't expose the error message — it's already
// in Vercel logs for debugging, and surfacing internals to a driver
// is just noise.
//
// "use client" is required by Next.js for error.tsx files because
// the reset() button needs an event handler. The shell still loads
// the brand styles from globals.css via the root layout.

import { useEffect } from "react";
import Link from "next/link";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: Props) {
  useEffect(() => {
    // Best-effort: surface to console so anyone with devtools open
    // can see what happened. Vercel server-side logs already have
    // the full stack.
    // eslint-disable-next-line no-console
    console.error("[root error boundary]", error);
  }, [error]);

  return (
    <main className="min-h-screen bg-brand-paper text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-5 py-16 sm:py-24">
        <p className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          Something went sideways
        </p>
        <h1 className="text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink sm:text-5xl">
          That page didn&rsquo;t load.
        </h1>
        <p className="text-lg leading-[1.5] text-brand-ink">
          Not your fault — something on our end. The error is logged and
          we&rsquo;ll look at it. Meanwhile, the rest of the site is fine.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-12 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-brand-paper shadow-sm transition-colors hover:bg-brand-medium"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-md border border-brand-rule px-6 text-sm font-medium text-brand-ink hover:bg-brand-surface"
          >
            Back home
          </Link>
        </div>
        {error.digest ? (
          <p className="mt-4 text-xs text-brand-muted">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </div>
    </main>
  );
}
