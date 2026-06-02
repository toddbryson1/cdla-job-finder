import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/SiteShell";

// Copy locked verbatim per SPEC_about-page-copy-v1.md. Driver-facing voice
// (warm, direct, no buzzwords, no fake humility). Sections render top to
// bottom per spec §3:
//
//   1. Mission statement
//   2. The problem
//   3. What CDLA.jobs does
//   4. Who built it (Todd's founder section)
//   5. What we believe
//   6. Contact
//
// "Ind**d" stylization in the founder section is the agreed compromise per
// spec §7.3 — used exactly once on this page, nowhere else on the platform.
// Email addresses in the contact section are placeholders per spec §11.2;
// using sales@cdla.jobs as a single intake address until others are
// confirmed.

export const metadata: Metadata = {
  title: "About CDLA.jobs — Built for drivers.",
  description:
    "CDLA.jobs is an AI-driven matching platform for CDL-A drivers. Founded by Todd Bryson, built to fix what's broken in trucking hiring.",
  alternates: { canonical: "https://www.cdla.jobs/about" },
};

export default function AboutPage() {
  return (
    <SiteShell>
      <Mission />
      <TheProblem />
      <WhatWeDo />
      <WhoBuiltIt />
      <WhatWeBelieve />
      <GetInTouch />
    </SiteShell>
  );
}

function Mission() {
  return (
    <section className="bg-brand-surface">
      <div className="mx-auto max-w-4xl px-5 py-16 sm:py-24">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-medium">
          About
        </p>
        <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-brand-ink sm:text-5xl">
          CDLA.jobs exists to give CDL-A drivers a hiring process that
          respects their time.
        </h1>
      </div>
    </section>
  );
}

function TheProblem() {
  return (
    <section className="border-t border-brand-rule">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          Hiring is broken on both sides.
        </h2>
        <p className="mt-6 text-base leading-7 text-brand-ink">
          The way CDL-A drivers find jobs hasn&rsquo;t really changed in 20
          years. Apply to a dozen carriers. Fill out the same information a
          dozen times. Wait for recruiters to call back &mdash; except half of
          them never do, and the other half are pitching jobs you didn&rsquo;t
          ask about, for equipment you don&rsquo;t run, in regions you
          don&rsquo;t want.
        </p>
        <p className="mt-4 text-base leading-7 text-brand-ink">
          The carriers see the same broken thing from the other side. Their
          recruiters spend half their day on applications that were never
          going to qualify. Cost per hire keeps climbing. Time to fill drags
          out. Everyone loses except the job boards that get paid whether or
          not anyone gets hired.
        </p>
      </div>
    </section>
  );
}

function WhatWeDo() {
  return (
    <section className="border-t border-brand-rule bg-brand-surface">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          A different model.
        </h2>
        <p className="mt-6 text-base leading-7 text-brand-ink">
          CDLA.jobs is an AI-driven matching platform. Drivers tell us once
          what they want &mdash; their experience, their equipment, their
          schedule preference, the kind of carrier they&rsquo;re looking for.
          We match them to carriers actually hiring drivers like them. The
          driver picks which carriers get their information. Nobody else does.
        </p>
        <p className="mt-4 text-base leading-7 text-brand-ink">
          No 20-page applications until the driver is ready to apply to a
          specific carrier. No selling driver contact info to lead panels. No
          bombarding drivers with calls about jobs they didn&rsquo;t ask
          about. Drivers stay in control of who sees their information and
          when.
        </p>
        <p className="mt-4 text-base leading-7 text-brand-ink">
          We don&rsquo;t run background checks. We don&rsquo;t pull MVRs. We
          don&rsquo;t replace the carrier&rsquo;s hiring process. We feed it
          better-qualified candidates so everyone&rsquo;s time gets spent on
          conversations that might actually lead somewhere.
        </p>
      </div>
    </section>
  );
}

function WhoBuiltIt() {
  return (
    <section className="border-t border-brand-rule">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          Built by Todd Bryson.
        </h2>
        <p className="mt-6 text-base leading-7 text-brand-ink">
          Todd has been designing software since 2015 and working in truck
          driver recruiting since 2021. Along the way he&rsquo;s built,
          bought, and sold four companies &mdash; two acquisitions and two
          exits &mdash; most of them at the intersection of trucking and
          technology.
        </p>
        <p className="mt-4 text-base leading-7 text-brand-ink">
          CDLA.jobs is the platform he wishes had existed back when he started
          in this space. He spent enough years watching drivers waste their
          time on Ind**d (and watching recruiters waste theirs sorting through
          the resulting noise) to know exactly what the broken parts of the
          model are. CDLA.jobs is the unbroken version.
        </p>
      </div>
    </section>
  );
}

function WhatWeBelieve() {
  const beliefs: Array<{ title: string; body: string }> = [
    {
      title: "Drivers run their own search.",
      body: "The driver decides which carriers see their information. We don't sell it. We don't share it with anyone they didn't pick.",
    },
    {
      title: "Carriers pay if they want to. Drivers always pay zero.",
      body: "The platform is free for drivers. Carriers can subscribe for priority access if they want it. Drivers never pay us anything, ever.",
    },
    {
      title: "Honest matching, even when it's inconvenient.",
      body: "If a driver's profile makes them hard to place, we say so. If we don't have matches in their region, we say so. We don't pretend.",
    },
    {
      title: "The hiring decision stays with the carrier.",
      body: "We're a matching service, not a recruiter. We don't promise anyone they'll be hired. We connect drivers to carriers and step out of the way.",
    },
  ];
  return (
    <section className="border-t border-brand-rule bg-brand-surface">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          What we believe.
        </h2>
        <ul className="mt-8 space-y-5">
          {beliefs.map((b) => (
            <li
              key={b.title}
              className="rounded-lg border border-brand-rule bg-brand-paper p-5"
            >
              <p className="text-base font-semibold text-brand-ink">
                {b.title}
              </p>
              <p className="mt-2 text-sm leading-6 text-brand-ink">{b.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function GetInTouch() {
  return (
    <section className="border-t border-brand-rule">
      <div className="mx-auto max-w-3xl px-5 py-14 sm:py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          Get in touch.
        </h2>
        <div className="mt-6 space-y-4 text-base leading-7 text-brand-ink">
          <p>
            <span className="font-semibold">Drivers:</span> the fastest way to
            get started is to{" "}
            <Link
              href="/"
              className="font-medium text-brand-medium underline hover:text-brand-deep"
            >
              talk to Debbie on the homepage
            </Link>
            . If you&rsquo;d rather reach someone directly, email{" "}
            <a
              href="mailto:sales@cdla.jobs"
              className="font-medium text-brand-medium underline hover:text-brand-deep"
            >
              sales@cdla.jobs
            </a>
            .
          </p>
          <p>
            <span className="font-semibold">Carriers:</span> see{" "}
            <Link
              href="/partners"
              className="font-medium text-brand-medium underline hover:text-brand-deep"
            >
              /partners
            </Link>{" "}
            for the integration and exclusivity tracks, or email{" "}
            <a
              href="mailto:sales@cdla.jobs"
              className="font-medium text-brand-medium underline hover:text-brand-deep"
            >
              sales@cdla.jobs
            </a>
            .
          </p>
          <p>
            <span className="font-semibold">
              Press, partnerships, or anything else:
            </span>{" "}
            <a
              href="mailto:sales@cdla.jobs"
              className="font-medium text-brand-medium underline hover:text-brand-deep"
            >
              sales@cdla.jobs
            </a>
            .
          </p>
          {/* TODO: split into drivers@, partners@, press@ addresses once
              those mailboxes are set up (spec §11.2). Routing to
              sales@cdla.jobs for v1. */}
        </div>
      </div>
    </section>
  );
}
