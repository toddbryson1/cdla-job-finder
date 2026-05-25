import type { Metadata } from "next";
import Link from "next/link";
import { CarrierShell, Section } from "@/components/CarrierPage";

// Carrier-side entry point. The spec (§10) explicitly notes the index page
// is not required, but linking directly to /partners/integration or
// /partners/exclusivity strands carriers who haven't been told which tier
// they want. This page is a thin landing — one paragraph, both tiers
// side-by-side, "talk to sales" if neither fits. Verbatim copy lives on
// the two tier pages.

export const metadata: Metadata = {
  title: "Partner with CDLA.jobs — Carrier options",
  description:
    "CDLA.jobs has two carrier tiers: Tier 2 free (matched leads to your Tenstreet) and Tier 1 $2,500/month flat (24-hour exclusivity, priority placement, QBR).",
  alternates: { canonical: "https://cdla.jobs/partners" },
};

export default function PartnersIndex() {
  return (
    <CarrierShell>
      <Hero />
      <NotAJobBoard />
      <WhereDriversComeFrom />
      <Tiers />
      <ClosingNote />
    </CarrierShell>
  );
}

function WhereDriversComeFrom() {
  return (
    <Section heading="Where the drivers come from.">
      <p className="max-w-3xl text-base leading-7 text-brand-ink">
        We don&rsquo;t wait for drivers to find your careers page. We bring
        them. Two channels, both pointed at the matching engine:
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Organic SEO &amp; paid advertising
          </p>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            We rank for the searches drivers actually run — equipment +
            region combinations carriers can&rsquo;t economically run on
            individually. Paid ads run against your specific jobs on top of
            organic rankings.
          </p>
        </div>
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Original driver content
          </p>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            YouTube long-form, TikTok and Instagram short-form, Facebook
            threads and groups. Pay trends by lane, equipment shifts,
            freight-market reality. Drivers come for the content; they
            complete intake because they&rsquo;re already in our world.
          </p>
        </div>
      </div>

      <p className="mt-6 max-w-3xl text-sm leading-6 text-brand-ink">
        The output: drivers who match your stated criteria, routed to your
        ATS, without you running paid spend across five different job boards
        yourself.
      </p>
    </Section>
  );
}

function NotAJobBoard() {
  return (
    <Section heading="This isn&rsquo;t a job board.">
      <div className="max-w-3xl space-y-4 text-base leading-7 text-brand-ink">
        <p>
          At least not in the way you&rsquo;re used to. You don&rsquo;t post
          jobs on CDLA.jobs. We take an API feed of the jobs already on your
          website — as long as your careers page lists current openings,
          drivers see those roles in their matches.
        </p>
        <p>
          The matching engine uses AI and automation to compare every driver
          against your hiring criteria: location, experience, equipment, what
          they disclosed about their MVR, and their criminal background.
          Drivers who don&rsquo;t clear your filters never reach your inbox.
          The prescreening is the product.
        </p>
        <p>
          Matches the driver releases to you land in your ATS as
          prequalifications — Tenstreet by default, with the integration
          configured by us — so your team picks them up in the workflow they
          already use. No new tool to learn, no second inbox to check.
        </p>
        <p>
          Pricing is built to replace what carriers spend on the job boards,
          not stack on top of it. Lower advertising spend leaves more room to
          pay drivers better — which is the actual fix for a hiring market
          that&rsquo;s been paying too much to advertise the same jobs and
          not enough to fill the trucks.
        </p>
      </div>
    </Section>
  );
}

function Hero() {
  return (
    <section className="bg-brand-surface">
      <div className="mx-auto max-w-5xl px-6 pb-14 pt-14 sm:pb-20 sm:pt-20">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
          For carriers
        </p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
          Matched CDL-A driver prequalifications, delivered to your ATS.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-brand-ink sm:text-lg">
          Drivers complete one intake. We match them against your hiring
          criteria. They pick which carriers see their info. You get
          pre-qualified candidates in your Tenstreet, not a lead-list panel.
          Free at Tier 2; $2,500/month flat at Tier 1 for first-look and
          priority placement. No per-hire fees on either tier.
        </p>
      </div>
    </section>
  );
}

function Tiers() {
  return (
    <Section heading="Pick your tier.">
      <div className="grid gap-6 sm:grid-cols-2">
        <TierCard
          tag="Tier 2 — Free"
          tagClass="text-brand-medium"
          title="Matched leads to your Tenstreet."
          bullets={[
            "Matched driver prequalifications delivered to your Tenstreet",
            "Free Tenstreet integration setup",
            "No setup fee, no per-lead fee, no per-hire fee",
            "Cancel any time — nothing to cancel",
          ]}
          ctaLabel="See Tier 2 details"
          ctaHref="/partners/integration"
        />
        <TierCard
          tag="Tier 1 — $2,500/month flat"
          tagClass="text-brand-gold"
          title="24-hour first-look on every matched driver."
          bullets={[
            "24-hour exclusivity window on driver matches",
            "Priority placement in driver match results",
            "Quarterly business review with your account contact",
            "Same matching engine as Tier 2; commercial difference only",
          ]}
          ctaLabel="See Tier 1 details"
          ctaHref="/partners/exclusivity"
        />
      </div>
    </Section>
  );
}

function TierCard({
  tag,
  tagClass,
  title,
  bullets,
  ctaLabel,
  ctaHref,
}: {
  tag: string;
  tagClass: string;
  title: string;
  bullets: string[];
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col rounded-lg border-2 border-brand-rule bg-white p-6">
      <p
        className={`text-xs font-semibold uppercase tracking-wider ${tagClass}`}
      >
        {tag}
      </p>
      <h3 className="mt-2 text-xl font-semibold text-brand-ink">{title}</h3>
      <ul className="mt-4 space-y-2 text-sm leading-6 text-brand-ink">
        {bullets.map((b) => (
          <li key={b}>&middot; {b}</li>
        ))}
      </ul>
      <div className="mt-6 flex-1" />
      <Link
        href={ctaHref}
        className="inline-flex h-11 w-full items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
      >
        {ctaLabel}
      </Link>
    </div>
  );
}

function ClosingNote() {
  return (
    <Section heading="Not sure which tier?">
      <p className="max-w-3xl text-sm leading-6 text-brand-ink">
        Most carriers start on Tier 2. It&rsquo;s free, the integration is
        free, and you can see how much volume you actually get against your
        criteria before committing to Tier 1. Carriers who specifically want
        first-look — usually because they&rsquo;re hiring against tight
        timelines in competitive markets — skip straight to Tier 1.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="mailto:sales@cdla.jobs?subject=Carrier%20fit%20call"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Talk to sales
        </a>
        <a
          href="/partners/brief"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Download the carrier brief (PDF)
        </a>
      </div>
    </Section>
  );
}
