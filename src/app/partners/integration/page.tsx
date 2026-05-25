import type { Metadata } from "next";
import Link from "next/link";
import {
  CarrierShell,
  CrossTierLink,
  Faq,
  PricingTable,
  Section,
} from "@/components/CarrierPage";

// Copy is locked verbatim per SPEC_carrier-landing-page-copy-v1.md §4.
// Do not paraphrase. CTAs link to placeholder anchors / mailto until the
// calendar booking tool decision lands (spec §9.1).

export const metadata: Metadata = {
  title: "Matched CDL-A driver leads to your Tenstreet — CDLA.jobs",
  description:
    "Tier 2 carriers receive matched CDL-A driver prequalifications in their Tenstreet account. Free. No per-hire fees. No setup fees. Cancel anytime.",
  alternates: { canonical: "https://cdla.jobs/partners/integration" },
};

const TIER2_PRICING = [
  { item: "Monthly subscription", cost: "$0" },
  { item: "Setup fee", cost: "$0" },
  { item: "Per-lead fee", cost: "$0" },
  { item: "Per-hire fee", cost: "$0" },
  { item: "Tenstreet integration setup", cost: "$0" },
  { item: "Tenstreet integration monthly", cost: "$0" },
  { item: "Cancellation fee", cost: "$0" },
];

const TIER2_FAQ = [
  {
    q: "Is this actually free, or is there a catch?",
    a: "It's actually free. Tier 2 has no monthly cost, no setup cost, no per-lead cost, and no per-hire cost. We make money on Tier 1 subscriptions from carriers who want priority placement and 24-hour exclusivity. Tier 2 is funded by the platform overall.",
  },
  {
    q: "How is this different from a lead vendor?",
    a: "Lead vendors sell the same driver's contact information to multiple carriers. CDLA.jobs drivers consent to share their prequalification with you specifically — not to a panel of buyers. The driver picks which carriers see them. We're a matching service, not a contact-list reseller.",
  },
  {
    q: "Do you run background checks?",
    a: "No. Background checks, MVR pulls, and FCRA-authorized record retrieval stay inside your existing application process in Tenstreet. We don't touch that — by design.",
  },
  {
    q: "What does the prequalification record include?",
    a: "What the driver disclosed on intake: experience, equipment, endorsements, schedule preference, regions, plus their stage 2 safety answers (accidents, violations, DUI, felony — as disclosed by the driver). The driver attests to accuracy. Carriers verify in their own application process.",
  },
  {
    q: "What if a driver disclosed something the carrier wouldn't accept?",
    a: "The matching engine filters drivers against your stated hiring criteria before any prequalification reaches you. If you don't accept failed DOT tests, drivers who failed a DOT test don't see you in their match results. You only see drivers whose disclosed history is within your stated tolerances.",
  },
  {
    q: "Can we change our hiring criteria later?",
    a: "Yes. Your hiring criteria are stored in our system and editable. Most carriers refine criteria in their first 30 days as they see what's coming through. Material changes (new equipment, new regions) can be picked up the same day.",
  },
  {
    q: "How do we cancel?",
    a: "You email us and we stop sending leads. No paperwork, no exit interview, no notice period. Tier 2 is built to make leaving as easy as starting.",
  },
  {
    q: "Do we have to use Tenstreet?",
    a: "The free integration is for Tenstreet specifically. Carriers on other ATS platforms (IntelliApp, DriverReach, etc.) receive matched leads by email. Tier 2 works for any carrier; the Tenstreet integration is a quality upgrade for carriers already on Tenstreet.",
  },
];

export default function IntegrationPage() {
  return (
    <CarrierShell>
      <Hero />
      <ModelSection />
      <IncludedSection />
      <PricingSection />
      <HowItWorksSection />
      <FaqSection />
      <SecondaryCtaSection />
    </CarrierShell>
  );
}

function Hero() {
  return (
    <section className="bg-brand-surface">
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-14 sm:pb-20 sm:pt-20">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
          Tier 2 &middot; Free
        </p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
          Matched CDL-A driver leads delivered to your ATS. Free.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-brand-ink sm:text-lg">
          Drivers complete one intake on CDLA.jobs. We match them against your
          hiring criteria. They pick you. Their prequalification lands in your
          Tenstreet. No per-hire fees, no setup fees, no contracts.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          {/* TODO: replace mailto with calendar booking once tool is chosen (spec §9.1) */}
          <a
            href="mailto:sales@cdla.jobs?subject=Tier%202%20call"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
          >
            Talk to sales
          </a>
          {/* TODO: wire to real PDF export of the carrier pitch deck (spec §9.2) */}
          <a
            href="mailto:sales@cdla.jobs?subject=Request%20carrier%20brief"
            className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
          >
            Download the carrier brief (PDF)
          </a>
        </div>
        <p className="mt-5 text-sm text-brand-muted">
          Free tier. Tenstreet integration included. Cancel anytime —
          there&rsquo;s nothing to cancel.
        </p>
      </div>
    </section>
  );
}

function ModelSection() {
  return (
    <Section heading="What CDLA.jobs does. What your team does.">
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            CDLA.jobs handles
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-brand-ink">
            <li>&middot; Driver intake (one form per driver, not 20 applications)</li>
            <li>&middot; Matching drivers to your hiring criteria</li>
            <li>&middot; Driver-side consent (driver picks you specifically)</li>
            <li>
              &middot; Delivery of matched prequalifications to your Tenstreet
            </li>
          </ul>
        </div>
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Your team handles
          </p>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-brand-ink">
            <li>
              &middot; Full DOT 391 application (inside your existing Tenstreet
              workflow)
            </li>
            <li>&middot; FCRA-authorized background check</li>
            <li>&middot; MVR pull</li>
            <li>&middot; Previous employer verification</li>
            <li>&middot; Hiring decision</li>
          </ul>
        </div>
      </div>
      <p className="mt-8 max-w-3xl text-sm leading-6 text-brand-ink">
        We don&rsquo;t replace your ATS. We feed it pre-qualified candidates
        that match what you said you&rsquo;re hiring for.
      </p>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-brand-ink">
        The prequalification model is intentional. CDLA.jobs is not a recruiter
        and not a background-check vendor. We are a matching service. Drivers
        tell us what they&rsquo;re looking for; carriers tell us what
        they&rsquo;re hiring for; we connect the two. Everything that touches
        FCRA, DOT 391, or the actual employment decision stays inside your
        hiring process where it belongs.
      </p>
    </Section>
  );
}

function IncludedSection() {
  return (
    <Section heading="What you get at Tier 2.">
      <ul className="grid gap-3 text-sm leading-6 text-brand-ink sm:grid-cols-2">
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Matched driver prequalifications delivered to your Tenstreet account
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Free Tenstreet integration (setup and configuration handled by us)
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Hiring criteria intake (we capture what you&rsquo;re hiring for
          during onboarding)
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Match volume reporting (basic: how many drivers matched per week)
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Standard email support
        </li>
      </ul>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-brand-ink">
        The Tenstreet integration is the free quality upgrade. Carriers on
        Tier 2 without integration receive matched driver leads by email;
        carriers with integration receive the prequalification directly into
        their Tenstreet pipeline as if the driver had started an application
        on their own careers page. Same lead, less friction.
      </p>
    </Section>
  );
}

function PricingSection() {
  return (
    <Section heading="What this costs.">
      <PricingTable rows={TIER2_PRICING} />
      <p className="mt-6 max-w-3xl text-sm leading-6 text-brand-ink">
        There is no Tier 2 contract. You start, you stop, you start again. We
        make our money on Tier 1 subscriptions (carriers who want priority
        placement) and our growing network of subscription partners. Tier 2 is
        free because matched leads at scale make the platform work for everyone
        — drivers find better carriers, carriers find pre-qualified drivers,
        the matching gets smarter over time.
      </p>
    </Section>
  );
}

function HowItWorksSection() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "Step 1",
      title: "Hiring criteria call (30 minutes).",
      body: "We capture what you're hiring for. Equipment, regions, minimum experience, endorsement requirements, what you'll consider on safety history. Most carriers complete this in one call.",
    },
    {
      n: "Step 2",
      title: "Tenstreet integration setup.",
      body: "We work with your Tenstreet account team to configure the lead delivery integration. Typically completed within one business week. Your team's lift here is minimal — mostly approvals.",
    },
    {
      n: "Step 3",
      title: "Test lead.",
      body: "We send a synthetic test lead through the integration to confirm everything routes correctly to your Tenstreet pipeline.",
    },
    {
      n: "Step 4",
      title: "You're live.",
      body: "Matched driver prequalifications start flowing to your Tenstreet as they're generated. Most carriers see their first real match within days of going live.",
    },
  ];
  return (
    <Section heading="How onboarding goes.">
      <ol className="space-y-5">
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
    </Section>
  );
}

function FaqSection() {
  return (
    <Section heading="Common questions.">
      <Faq items={TIER2_FAQ} />
    </Section>
  );
}

function SecondaryCtaSection() {
  return (
    <Section heading="Want to see it in action?">
      <p className="max-w-3xl text-sm leading-6 text-brand-ink">
        The 30-minute hiring criteria call doubles as a working session — we
        show you the matching logic, walk through what your prequalifications
        would look like, and answer specific questions about how it&rsquo;d
        work for your operation. No commitment, no pressure to upgrade.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="mailto:sales@cdla.jobs?subject=Schedule%20hiring%20criteria%20call"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Schedule a hiring criteria call
        </a>
        <a
          href="mailto:sales@cdla.jobs?subject=Request%20carrier%20brief"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Download the carrier brief (PDF)
        </a>
        <a
          href="mailto:sales@cdla.jobs"
          className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
        >
          Email sales
        </a>
      </div>
      <CrossTierLink href="/partners/exclusivity">
        Considering exclusivity? See Tier 1
      </CrossTierLink>
    </Section>
  );
}

// Suppress unused import warning if Link is not referenced; kept for future
// cross-links inside the page body.
void Link;
