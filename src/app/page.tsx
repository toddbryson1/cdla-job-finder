import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";

// Copy is locked verbatim per SPEC_homepage-copy-v1.md. Do not paraphrase
// headlines or microcopy. Sections render top-to-bottom per spec §3:
// hero → how it works → why different → for carriers → footer (in shell).
//
// Debbie (the chatbox AI per SPEC_conversational-ai-intake-v1.md) is not
// built yet. The hero renders her opening message as static content and
// routes the visitor to /intake (the form fallback). When Debbie ships,
// the chatbox visual scaffold becomes the real chat surface.

export const metadata: Metadata = {
  title: "CDLA.jobs — Class A driver matching. Built for drivers.",
  description:
    "Find your next CDL-A driving job in five minutes. Talk to Debbie, our AI driver matcher. Real carriers, no recruiter spam. Free for drivers.",
  alternates: { canonical: "https://www.cdla.jobs/" },
  openGraph: {
    title: "CDLA.jobs — Class A driver matching. Built for drivers.",
    description:
      "Find your next CDL-A driving job in five minutes. Talk to Debbie, our AI driver matcher. Real carriers, no recruiter spam. Free for drivers.",
    url: "https://www.cdla.jobs/",
    siteName: "CDLA.jobs",
    type: "website",
  },
};

export default function HomePage() {
  return (
    <SiteShell>
      <Hero />
      <HowItWorks />
      <WhyDifferent />
      <ForCarriers />
    </SiteShell>
  );
}

function Hero() {
  return (
    <section className="bg-brand-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pb-14 pt-12 sm:pb-20 sm:pt-20 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <h1 className="text-3xl font-semibold leading-tight tracking-tight text-brand-ink sm:text-5xl">
            Find your next driving job in five minutes.
          </h1>
          <p className="mt-5 text-base leading-7 text-brand-ink sm:text-lg">
            Talk to Debbie. Tell her what you want. She matches you to
            carriers hiring right now &mdash; without the 20-page applications
            or the recruiter spam.
          </p>
          <p className="mt-5 text-sm text-brand-muted">
            Free for drivers. We don&rsquo;t sell your information. Match in
            five minutes.
          </p>
        </div>
        <DebbieChatScaffold />
      </div>
    </section>
  );
}

// Visual scaffold for Debbie's chatbox per spec §4.5. Rendered as static
// content until the real chat surface ships
// (SPEC_conversational-ai-intake-v1.md). The CTA routes the driver to
// /intake so the homepage works without the AI.
function DebbieChatScaffold() {
  return (
    <div className="rounded-2xl border border-brand-rule bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-brand-rule px-4 py-3">
        <div
          aria-hidden="true"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-deep text-xs font-semibold text-white"
        >
          D
        </div>
        <div>
          <p className="text-sm font-semibold text-brand-ink">Debbie</p>
          <p className="text-xs text-brand-muted">
            AI driver matcher at CDLA.jobs
          </p>
        </div>
      </div>
      <div className="space-y-3 px-4 py-4">
        <div className="max-w-[85%] rounded-2xl rounded-tl-md bg-brand-surface px-4 py-3 text-sm leading-6 text-brand-ink">
          Hey &mdash; I&rsquo;m Debbie, the AI driver matcher at CDLA.jobs.
          I&rsquo;ll ask a few quick questions, then show you carriers that
          fit what you want. Five minutes, max. You can talk or type, or
          upload your resume if that&rsquo;s easier.
        </div>
      </div>
      <div className="border-t border-brand-rule px-4 py-3">
        {/* TODO: replace with the real chatbox once Debbie ships
            (SPEC_conversational-ai-intake-v1.md). Static CTA for now. */}
        <Link
          href="/intake"
          className="block w-full rounded-md bg-brand-deep px-4 py-3 text-center text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Start your intake
        </Link>
        <p className="mt-2 text-center text-xs text-brand-muted">
          Voice chat coming soon. For now it&rsquo;s a 6-minute form.
        </p>
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "Step 1",
      title: "Tell Debbie what you want.",
      body: "Five minutes. Talk, type, or upload your resume.",
    },
    {
      n: "Step 2",
      title: "See your matches.",
      body: "Carriers hiring drivers like you, ranked by fit. No applying to 40 places.",
    },
    {
      n: "Step 3",
      title: "Pick the carriers you want.",
      body: "They contact you. You decide who gets your info. Nobody gets sold your number.",
    },
  ];
  return (
    <section id="how-it-works" className="border-t border-brand-rule">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-8 grid gap-5 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.n}
              className="rounded-lg border border-brand-rule bg-white p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-medium">
                {s.n}
              </p>
              <p className="mt-1 text-base font-semibold text-brand-ink">
                {s.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-brand-ink">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function WhyDifferent() {
  const claims: Array<{ title: string; body: string }> = [
    {
      title: "Free for drivers.",
      body: "You don't pay us anything. Carriers do — but only the ones that want priority access. Drivers always pay zero.",
    },
    {
      title: "We don't sell your data.",
      body: "Your information goes to carriers you pick. Not to a panel of buyers. Not to “marketing partners.” Not to anyone you didn't choose.",
    },
    {
      title: "Match in five minutes.",
      body: "Debbie asks a handful of questions and shows you carriers actually hiring drivers like you. No 20-page applications until you're ready to apply to a specific carrier.",
    },
    {
      title: "Real carriers, not a lead farm.",
      body: "Every carrier in our system is hiring. If they're not, they're not in our system. We don't pad the results.",
    },
  ];
  return (
    <section className="border-t border-brand-rule bg-brand-surface">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          Why CDLA.jobs is different
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {claims.map((c) => (
            <div
              key={c.title}
              className="rounded-lg border border-brand-rule bg-white p-5"
            >
              <p className="text-base font-semibold text-brand-ink">
                {c.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-brand-ink">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ForCarriers() {
  return (
    <section className="border-t border-brand-rule bg-brand-deep text-white">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold">
          For carriers
        </p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Hiring CDL-A drivers?
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-white/85 sm:text-base">
          We send matched driver prequalifications to your ATS. Drivers choose
          to share their info with you &mdash; not a lead panel. Free at
          Tier 2; $2,500/month for 24-hour exclusivity. No per-hire fees, no
          setup fees.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/partners/integration"
            className="inline-flex h-11 items-center justify-center rounded-md bg-white px-5 text-sm font-semibold text-brand-deep hover:bg-brand-surface"
          >
            Integration
          </Link>
          <Link
            href="/partners/exclusivity"
            className="inline-flex h-11 items-center justify-center rounded-md border border-white/40 px-5 text-sm font-semibold text-white hover:bg-white/10"
          >
            Exclusivity
          </Link>
        </div>
      </div>
    </section>
  );
}

