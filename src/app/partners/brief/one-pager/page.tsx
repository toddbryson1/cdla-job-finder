import type { Metadata } from "next";
import Link from "next/link";
import { PrintButton } from "./PrintButton";

// Printable carrier brief. Copy is VERBATIM from
// docs/CDLAjobs_Carrier_Brief_OnePager_v1.md — do not paraphrase (brand
// voice rule). Rendered as a clean, print-optimized page so carriers can
// Save-as-PDF directly; the "Download the carrier brief (PDF)" buttons
// across /partners/* link here. The /partners/brief email-capture form
// remains for the "email it to me" path.

export const metadata: Metadata = {
  title: "Carrier Brief — CDLA.jobs",
  description:
    "One-page brief: how CDLA.jobs delivers matched, consented CDL-A driver prequalifications to your ATS. Tier 2 free, Tier 1 $2,500/mo flat.",
  // Print/download artifact — keep it out of the index to avoid thin /
  // duplicate content competing with /partners.
  robots: { index: false, follow: true },
};

export default function CarrierBriefOnePager() {
  return (
    <main className="mx-auto max-w-3xl bg-white px-6 py-10 text-brand-ink print:py-0">
      {/* Screen-only toolbar; never printed. */}
      <div className="print:hidden mb-8 flex items-center justify-between gap-4 border-b border-brand-rule pb-4">
        <Link
          href="/partners"
          className="text-sm font-medium text-brand-medium hover:text-brand-deep"
        >
          ← Back to partners
        </Link>
        <PrintButton />
      </div>

      <article className="space-y-6 leading-7">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">
            CDLA.jobs — Carrier Brief
          </h1>
          <p className="mt-2 font-medium text-brand-muted">
            One-page summary for recruiting directors, hiring managers, and
            fleet owners.
          </p>
        </header>

        <Section title="What we are">
          <p>
            <strong>
              CDLA.jobs is a CDL-A driver matching service, not a job board.
            </strong>{" "}
            You don&rsquo;t post jobs on our platform. We take an API feed of
            the openings already published on your careers page, AI-prescreen
            drivers against your hiring criteria, and deliver the matches that
            clear your filters directly into your ATS — Tenstreet by default,
            integration configured by us.
          </p>
          <p>
            The product is the prescreening. Drivers who don&rsquo;t match your
            stated criteria — location, experience, equipment, MVR disclosures,
            criminal history, endorsements, schedule preference — never reach
            your inbox. Drivers who do match are people the driver themself
            selected to share their prequalification with. Not a panel. Not a
            lead list resold to ten carriers.
          </p>
        </Section>

        <Section title="How it works">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <strong>Your jobs feed in.</strong> As long as your careers page
              lists current openings, drivers see those roles in their
              CDLA.jobs matches.
            </li>
            <li>
              <strong>Drivers complete one intake.</strong> We capture
              experience, equipment, endorsements, regions, schedule, and
              stage-2 safety answers.
            </li>
            <li>
              <strong>AI matches against your criteria.</strong> Only drivers
              who clear your filters surface for your roles.
            </li>
            <li>
              <strong>The driver picks you.</strong> Driver-side consent is
              per-carrier — they release their prequalification to you
              specifically.
            </li>
            <li>
              <strong>Their prequalification lands in your ATS.</strong> Your
              team picks it up in the Tenstreet workflow they already use.
            </li>
            <li>
              <strong>
                You complete DOT 391, FCRA-authorized background, MVR, and the
                hiring decision.
              </strong>{" "}
              That all stays inside your existing process. We don&rsquo;t touch
              FCRA-regulated steps.
            </li>
          </ol>
        </Section>

        <Section title="Pricing">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rule text-left">
                <th className="py-2 pr-4 font-semibold">Tier</th>
                <th className="py-2 pr-4 font-semibold">Monthly</th>
                <th className="py-2 font-semibold">What you get</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-brand-rule align-top">
                <td className="py-2 pr-4 font-semibold">Tier 2</td>
                <td className="py-2 pr-4 font-semibold">$0</td>
                <td className="py-2">
                  Matched driver prequalifications delivered to your Tenstreet;
                  free integration setup; match volume reporting.
                </td>
              </tr>
              <tr className="align-top">
                <td className="py-2 pr-4 font-semibold">Tier 1</td>
                <td className="py-2 pr-4 font-semibold">$2,500 flat</td>
                <td className="py-2">
                  Everything in Tier 2, plus a 24-hour exclusivity window on
                  every match, priority placement in driver match results, and
                  quarterly business reviews.
                </td>
              </tr>
            </tbody>
          </table>
          <p>
            <strong>No per-lead fee. No per-hire fee. No setup fee.</strong>{" "}
            Tier 2 cancels by email. Tier 1 cancels with 30 days notice. The
            flat rate is the rate — no volume discounts, no contract lengths, no
            promotional pricing.
          </p>
        </Section>

        <Section title="What makes this different">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>
                Drivers consent per-carrier, not to a panel.
              </strong>{" "}
              When a driver picks you, you&rsquo;re the only carrier who gets
              that prequalification. Lead vendors sell the same contact to ten
              buyers; we don&rsquo;t.
            </li>
            <li>
              <strong>
                You handle FCRA, DOT 391, MVR, PSP, drug/alcohol verification,
                and the hire.
              </strong>{" "}
              We don&rsquo;t touch the regulated parts. We&rsquo;re a matching
              service, not a CRA.
            </li>
            <li>
              <strong>
                The pricing replaces job-board spend, not stacks on top of it.
              </strong>{" "}
              Carriers running large fleets pay the same $2,500/month as small
              ones at Tier 1. Lower advertising spend leaves more room to pay
              drivers better.
            </li>
            <li>
              <strong>Tenstreet integration is included.</strong> Setup and
              configuration handled by us. Carriers on other ATS platforms
              receive matched leads by email; the matching itself works the
              same either way.
            </li>
          </ul>
        </Section>

        <Section title="What we don't do">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Background checks (yours, in your ATS)</li>
            <li>MVR or PSP pulls (yours)</li>
            <li>DOT 391 application (yours)</li>
            <li>Driver-side guarantees of hire (we&rsquo;re matching, you decide)</li>
            <li>Pre-hire phone screens (your recruiters)</li>
            <li>
              Selling the same driver to multiple carriers without their consent
              (ever)
            </li>
          </ul>
        </Section>

        <Section title="Onboarding">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Tier 2:</strong> 30-minute hiring criteria call. Tenstreet
              integration in one business week. Test lead. Live.
            </li>
            <li>
              <strong>Tier 1:</strong> 45-minute fit call. One-page agreement.
              Tenstreet integration in one business week. Test lead and dry-run
              of the exclusivity mechanics. Live. First QBR at 90 days.
            </li>
          </ul>
        </Section>

        <Section title="Talk to us">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:sales@cdla.jobs"
                className="text-brand-medium underline"
              >
                sales@cdla.jobs
              </a>
            </li>
            <li>
              <strong>Schedule a 30-minute call:</strong> request via email and
              we&rsquo;ll send a calendar link
            </li>
            <li>
              <strong>Web:</strong> https://cdla.jobs/partners
            </li>
          </ul>
        </Section>

        <p className="text-sm text-brand-muted">
          CDLA.jobs is in beta. Some platform claims describe the model rather
          than historical performance; we&rsquo;ll say so explicitly when
          relevant on the call. Carriers make their own hiring decisions.
          CDLA.jobs does not warrant any specific outcome from a match.
        </p>

        <p className="border-t border-brand-rule pt-4 text-xs italic text-brand-muted">
          v1 — Carrier Brief One-Pager. Companion document to the Carrier Pitch
          Deck.
        </p>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 break-inside-avoid">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}
