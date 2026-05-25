import type { Metadata } from "next";
import {
  CarrierShell,
  CrossTierLink,
  Faq,
  PricingTable,
  Section,
} from "@/components/CarrierPage";

// Copy is locked verbatim per SPEC_carrier-landing-page-copy-v1.md §5.
// Do not paraphrase. CTAs link to placeholder anchors / mailto until the
// calendar booking tool decision lands (spec §9.1).

export const metadata: Metadata = {
  title: "24-hour exclusivity on matched CDL-A drivers — CDLA.jobs Tier 1",
  description:
    "Tier 1 carriers get 24-hour first-look on every matched CDL-A driver, priority placement, and quarterly business reviews. $2,500/month flat. No per-hire fees.",
  alternates: { canonical: "https://cdla.jobs/partners/exclusivity" },
};

const TIER1_PRICING = [
  { item: "Monthly subscription", cost: "$2,500 flat" },
  { item: "Setup fee", cost: "$0" },
  { item: "Per-lead fee", cost: "$0" },
  { item: "Per-hire fee", cost: "$0" },
  { item: "Tenstreet integration setup", cost: "$0" },
  { item: "Tenstreet integration monthly", cost: "$0" },
  { item: "Cancellation", cost: "30-day notice; no fee" },
];

const TIER1_FAQ = [
  {
    q: "How does the 24-hour exclusivity window actually work?",
    a: "When a driver completes intake and matches your criteria, their prequalification record is held back from Tier 2 carriers for 24 hours. You see it first. If you pursue, you submit through your normal Tenstreet workflow. If you don't pursue within 24 hours, the driver becomes visible to Tier 2 carriers in their match list. The driver is never told they were in an exclusivity window — from their side, your carrier just appeared in their matches.",
  },
  {
    q: "What happens if multiple Tier 1 carriers match the same driver?",
    a: "The driver's match list shows all Tier 1 carriers who matched, ranked by match-fit score against the driver's preferences. The 24-hour window applies equally to all Tier 1 matches — the first Tier 1 carrier to engage isn't given preference over others.",
  },
  {
    q: "Can we negotiate the $2,500 rate?",
    a: "No. The flat rate is part of the model. We don't do volume discounts, contract length discounts, or promotional pricing. Carriers paying the same rate eliminates a class of conversation that doesn't help anyone — the rate is the rate.",
  },
  {
    q: "Is there a contract length?",
    a: "No. Month-to-month with 30-day notice. The contract is one page and exists mostly to document the commercial terms in writing. We're not interested in locking in carriers who don't want to be there.",
  },
  {
    q: "What if Tier 2 carriers see the same driver after the window?",
    a: "After 24 hours, the driver's match list shows both Tier 1 and Tier 2 matches. Drivers pick which carriers they want to release their prequalification to. A Tier 2 carrier who appears in a driver's match list after the Tier 1 window may still get the lead — the driver chooses. The exclusivity window is a head start, not an exclusive right.",
  },
  {
    q: "Do we have to use Tenstreet?",
    a: "The free integration is for Tenstreet specifically. Tier 1 carriers on other ATS platforms can still subscribe — leads are delivered by email instead of integrated to the ATS. The 24-hour exclusivity window applies either way.",
  },
  {
    q: "How do we cancel?",
    a: "Email or call your account contact. 30 days from the notice date, the subscription ends and your carrier moves to Tier 2 (or out entirely if you prefer). No penalty, no exit fee, no signed paperwork.",
  },
  {
    q: "What does the quarterly business review actually cover?",
    a: "Match volume against your criteria, your conversion data (how many matches led to applications, how many led to hires), criteria refinement based on what's working and what isn't, and any product changes or new features. It's a working session, not a sales call.",
  },
];

export default function ExclusivityPage() {
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
        <p className="text-xs font-medium uppercase tracking-wider text-brand-gold">
          Tier 1 &middot; $2,500/month
        </p>
        <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
          See matched CDL-A drivers 24 hours before anyone else.
        </h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-brand-ink sm:text-lg">
          Tier 1 carriers get a 24-hour exclusivity window on every matched
          driver in their stated criteria. Priority placement in driver match
          results. Quarterly business reviews. $2,500 per month, flat. No
          per-hire fees.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <a
            href="mailto:sales@cdla.jobs?subject=Tier%201%20call"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
          >
            Schedule a Tier 1 call
          </a>
          <a
            href="/partners/brief"
            className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-5 text-sm font-medium text-brand-ink hover:bg-brand-surface"
          >
            Download the carrier brief (PDF)
          </a>
        </div>
        <p className="mt-5 text-sm text-brand-muted">
          Flat fee. No setup cost. No per-hire fees. Cancel anytime with 30
          days notice.
        </p>
      </div>
    </section>
  );
}

function ModelSection() {
  return (
    <Section heading="What Tier 1 gets you.">
      <p className="max-w-3xl text-sm leading-6 text-brand-ink">
        Tier 1 is the same matching engine as Tier 2, with three commercial
        differences:
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Exclusivity window
          </p>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            When a driver matches your criteria, you see them first. For 24
            hours, no other carrier sees that prequalification — even if the
            driver matches other carriers in their list. You decide whether to
            pursue. After 24 hours, the driver becomes visible to Tier 2
            carriers as well.
          </p>
        </div>
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Priority placement
          </p>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            When a driver views their match list, Tier 1 carriers appear
            first. The order within Tier 1 is determined by match-fit score
            against the driver&rsquo;s stated preferences.
          </p>
        </div>
        <div className="rounded-lg border border-brand-rule bg-white p-5">
          <p className="text-sm font-semibold text-brand-deep">
            Quarterly business review
          </p>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            Your account gets a quarterly call to review match volume,
            conversion data, and any criteria refinements. Tier 2 carriers
            get reporting; Tier 1 carriers get a working session with someone
            who knows their account.
          </p>
        </div>
      </div>
      <p className="mt-8 max-w-3xl text-sm leading-6 text-brand-ink">
        Everything else — Tenstreet integration, prequalification model, no
        per-hire fees, you handle FCRA/391 — is identical to Tier 2.
      </p>
    </Section>
  );
}

function IncludedSection() {
  return (
    <Section heading="What you get at Tier 1.">
      <ul className="grid gap-3 text-sm leading-6 text-brand-ink sm:grid-cols-2">
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          24-hour exclusivity window on every driver matched to your criteria
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Priority placement in driver match results
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Matched driver prequalifications delivered to your Tenstreet account
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Free Tenstreet integration (setup and configuration handled by us)
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Hiring criteria intake and refinement
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Match volume + conversion reporting
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Quarterly business review (60-minute account call)
        </li>
        <li className="rounded-md border border-brand-rule bg-white px-4 py-3">
          Direct line to your account contact (no support ticket queue)
        </li>
      </ul>
    </Section>
  );
}

function PricingSection() {
  return (
    <Section heading="What this costs.">
      <PricingTable rows={TIER1_PRICING} />
      <p className="mt-6 max-w-3xl text-sm leading-6 text-brand-ink">
        $2,500 per month is flat regardless of match volume. Carriers running
        large fleets and high hire counts pay the same as carriers running
        smaller operations. We don&rsquo;t charge per-hire because we
        don&rsquo;t want carriers gaming match volume to control cost — we
        want carriers focused on whether the matches are good ones.
      </p>
      <p className="mt-4 max-w-3xl text-sm leading-6 text-brand-ink">
        There is no setup fee, no contract length, and no early termination
        penalty. 30-day notice to cancel is to give the system time to wind
        down cleanly, not to lock you in.
      </p>
    </Section>
  );
}

function HowItWorksSection() {
  const steps: Array<{ n: string; title: string; body: string }> = [
    {
      n: "Step 1",
      title: "Tier 1 fit call (45 minutes).",
      body: "We confirm Tier 1 is right for your operation. Match volume expectations, criteria refinement, exclusivity window mechanics. Some carriers walk away from this call and start on Tier 2 instead; that's fine. Tier 1 is for carriers who specifically want first-look on matched drivers.",
    },
    {
      n: "Step 2",
      title: "Contract and onboarding.",
      body: "Standard 1-page Tier 1 agreement, then we capture hiring criteria in detail. Tier 1 criteria intake is more thorough than Tier 2 because you're paying for precision — we spend more time getting it right.",
    },
    {
      n: "Step 3",
      title: "Tenstreet integration setup.",
      body: "Same as Tier 2 — we configure the lead delivery integration with your Tenstreet account. Typically one business week.",
    },
    {
      n: "Step 4",
      title: "Test lead and dry-run.",
      body: "Synthetic test lead through the integration, plus a dry-run of the exclusivity window mechanics so you see exactly how the 24-hour first-look works.",
    },
    {
      n: "Step 5",
      title: "You're live.",
      body: "Matched drivers start landing in your exclusivity window the same day. Your first quarterly business review is scheduled for 90 days out.",
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
      <Faq items={TIER1_FAQ} />
    </Section>
  );
}

function SecondaryCtaSection() {
  return (
    <Section heading="Ready to talk?">
      <p className="max-w-3xl text-sm leading-6 text-brand-ink">
        Tier 1 is a 45-minute first call. We walk through how it&rsquo;d work
        for your operation specifically, what your hiring criteria would look
        like in our system, and what to expect on match volume. If Tier 1
        isn&rsquo;t the right fit, we&rsquo;ll say so — and Tier 2 is here if
        you want to start there.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <a
          href="mailto:sales@cdla.jobs?subject=Schedule%20Tier%201%20call"
          className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-6 text-sm font-semibold text-white shadow-sm hover:bg-brand-medium"
        >
          Schedule a Tier 1 call
        </a>
        <a
          href="/partners/brief"
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
      <CrossTierLink href="/partners/integration">
        Want to try the free tier first? See Tier 2
      </CrossTierLink>
    </Section>
  );
}
