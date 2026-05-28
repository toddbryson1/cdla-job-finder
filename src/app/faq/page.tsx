import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";
import { EXTENDED_FAQ, STANDARD_FAQ } from "@/lib/driver-faq";

// Driver-facing FAQ. Combines the locked STANDARD_FAQ (also shown on every
// /jobs/[region-equipment] landing page) with EXTENDED_FAQ (Debbie,
// records, account, data sharing — questions that come up on the broader
// site but don't belong on a per-landing-page surface). Source of truth
// for both surfaces lives in src/lib/driver-faq.ts.

export const metadata: Metadata = {
  title: "FAQ — CDLA.jobs",
  description:
    "Common questions from CDL-A drivers about CDLA.jobs: pricing, privacy, matching, records, and what happens after you submit.",
  alternates: { canonical: "https://www.cdla.jobs/faq" },
};

export default function FaqPage() {
  return (
    <SiteShell>
      <Hero />
      <FaqList heading="The basics" items={STANDARD_FAQ} />
      <FaqList heading="More questions" items={EXTENDED_FAQ} />
      <StillStuck />
    </SiteShell>
  );
}

function Hero() {
  return (
    <section className="bg-brand-surface">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
          FAQ
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
          Common questions, answered straight.
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-brand-ink">
          Most drivers want to know three things: is it free, do you share my
          info, and what actually happens after I submit. Those are the first
          three answers below. The rest are the questions we get most often
          after that.
        </p>
      </div>
    </section>
  );
}

function FaqList({
  heading,
  items,
}: {
  heading: string;
  items: Array<{ q: string; a: string }>;
}) {
  return (
    <section className="border-t border-brand-rule">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h2 className="text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">
          {heading}
        </h2>
        <dl className="mt-6 divide-y divide-brand-rule rounded-lg border border-brand-rule bg-white">
          {items.map((it) => (
            <div key={it.q} className="px-5 py-5 sm:px-6">
              <dt className="text-base font-semibold text-brand-ink">
                {it.q}
              </dt>
              <dd className="mt-2 text-sm leading-6 text-brand-ink">
                {it.a}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function StillStuck() {
  return (
    <section className="border-t border-brand-rule bg-brand-surface">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
        <h2 className="text-xl font-semibold tracking-tight text-brand-ink sm:text-2xl">
          Didn&rsquo;t find your answer?
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-brand-ink">
          Easiest path: start your intake and ask in the chat &mdash; or email
          us. We answer real questions from real drivers.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/intake"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
          >
            Start your intake
          </Link>
          <a
            href="mailto:sales@cdla.jobs"
            className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-white"
          >
            Email us
          </a>
        </div>
      </div>
    </section>
  );
}
