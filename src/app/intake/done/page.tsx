import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "You're in",
  description: "Your intake is in. We'll match you to carriers.",
  robots: { index: false, follow: false },
};

export default function IntakeDonePage() {
  return (
    <main className="min-h-screen bg-brand-surface">
      <div className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
        <div className="rounded-2xl border border-brand-rule bg-white p-8 sm:p-10 shadow-sm">
          <p className="text-sm font-medium text-brand-medium">CDLA.jobs</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-brand-ink">
            You&rsquo;re in.
          </h1>
          <p className="mt-4 text-base leading-7 text-brand-ink">
            We&rsquo;re running your profile against every carrier in our system right now.
            You&rsquo;ll get an email with your matches within a few minutes. You pick which
            carriers see your info. Nobody else does.
          </p>
          <div className="mt-6 rounded-lg bg-brand-surface p-4 text-sm leading-6 text-brand-muted">
            <p className="font-medium text-brand-ink">What happens next</p>
            <ol className="mt-2 list-decimal pl-5 space-y-1.5">
              <li>You get a match email.</li>
              <li>You pick the carriers you want to share your info with.</li>
              <li>Their recruiters reach out directly to start their hiring process.</li>
              <li>You complete their application with them &mdash; not us.</li>
            </ol>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
