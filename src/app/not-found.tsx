// Root not-found page. Renders when any route calls notFound() and
// when Next.js can't resolve a URL to any registered route. Without
// this file Next.js uses its built-in minimal "404" — which is
// unbranded and offers no recovery path.
//
// The default Next 16 not-found is fine functionally but jarring
// after every other page on the site has the warm-paper palette.
// Match brand voice + offer the same recovery options as the root
// error boundary.
//
// No "use client" needed: this page has no interactive state, just
// markdown-shaped content + Link components.

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Page not found — CDLA.jobs",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-brand-paper text-brand-ink">
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-6 px-5 py-16 sm:py-24">
        <p className="inline-flex items-center gap-2.5 text-[13px] font-semibold uppercase tracking-[0.12em] text-brand-medium">
          <span
            aria-hidden="true"
            className="inline-block h-px w-6 bg-brand-gold"
          />
          404
        </p>
        <h1 className="text-4xl font-bold leading-[1.04] tracking-[-0.03em] text-brand-ink sm:text-5xl">
          That page doesn&rsquo;t exist.
        </h1>
        <p className="text-lg leading-[1.5] text-brand-ink">
          The link might be old, mistyped, or the carrier may have pulled
          a job that used to live here. Try the homepage or browse the
          carrier list.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-brand-paper shadow-sm transition-colors hover:bg-brand-medium"
          >
            Back home
          </Link>
          <Link
            href="/carriers"
            className="inline-flex h-12 items-center justify-center rounded-md border border-brand-rule px-6 text-sm font-medium text-brand-ink hover:bg-brand-surface"
          >
            Browse carriers
          </Link>
        </div>
      </div>
    </main>
  );
}
