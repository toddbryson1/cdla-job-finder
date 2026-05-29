import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  jobPostingCycles,
} from "@/db/schema";
import { SiteShell } from "@/components/SiteShell";
import {
  buildJobPostingSlug,
  jobIdLikePattern,
} from "@/lib/job-slug";
import { buildCarrierSlug } from "@/lib/carrier-slug";
import { postingCycleIdPrefixFromSlug } from "@/lib/posting-cycles";
import {
  generateSeoCopy,
  deriveEquipmentNoun,
  displayCarrierName,
} from "@/lib/job-seo-copy";

// Individual job-posting pages live here. Each row in job_posting_cycles
// gets its own URL — slug suffix is the 8-char hex prefix of the
// posting_cycle id (not the carrier_job id). That gives us:
//
//   - Multiple URLs per job (one per active cycle, one per city)
//   - 20-day expiration: cycles past expires_at flip to 'expired' via
//     /api/cron/daily, the URL 404s, Google drops it from the index
//   - 3-day repost: 3 days after a cycle expires, a fresh cycle for
//     the same job is spawned in a (rotating) candidate city with a
//     new description variant
//   - Multi-city posting: each job has up to TARGET_CITIES_PER_JOB
//     concurrent cycles, each ≥50 miles from the others
//
// Per docs/SPEC_homepage-copy-v1.md §9.5: JobPosting schema belongs on
// individual job pages only — never on the homepage or aggregate /jobs
// pages.

export const revalidate = 900; // 15-min ISR

const SITE_ORIGIN = "https://www.cdla.jobs";

type JobRow = typeof carrierJobs.$inferSelect;
type CarrierRow = typeof carriers.$inferSelect;
type CycleRow = typeof jobPostingCycles.$inferSelect;

interface LoadedCycle {
  cycle: CycleRow;
  job: JobRow;
  carrier: CarrierRow;
}

async function loadCycleFromSlug(slug: string): Promise<LoadedCycle | null> {
  const prefix = postingCycleIdPrefixFromSlug(slug);
  if (!prefix) return null;

  const rows = await db
    .select({
      cycle: jobPostingCycles,
      job: carrierJobs,
      carrier: carriers,
    })
    .from(jobPostingCycles)
    .innerJoin(carrierJobs, eq(carrierJobs.id, jobPostingCycles.jobId))
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(
      and(
        like(sql`${jobPostingCycles.id}::text`, jobIdLikePattern(prefix)),
        eq(jobPostingCycles.status, "active"),
        eq(carrierJobs.status, "active"),
      ),
    )
    .limit(2);

  // Defensive: an 8-char prefix is unique in practice. If two rows
  // collide, return 404 rather than serve the wrong page.
  if (rows.length !== 1) return null;
  return rows[0];
}

interface JsonLdContext {
  loaded: LoadedCycle;
  slug: string;
  description: string;
}

function jobPostingJsonLd(ctx: JsonLdContext): object {
  const { loaded, slug, description } = ctx;
  const { cycle, job, carrier } = loaded;
  const carrierName = displayCarrierName(carrier.name);
  const sameAs = carrier.publicCareersUrl ?? undefined;

  const min = job.displayPayRangeMinWeeklyUsd;
  const max = job.displayPayRangeMaxWeeklyUsd ?? job.payRangeMaxWeeklyUsd;
  const baseSalary =
    max != null
      ? {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: min ?? max,
            maxValue: max,
            unitText: "WEEK",
          },
        }
      : undefined;

  // Geo coordinates come from the cycle (city we're rendering),
  // falling back to the domicile if the cycle lat/lng are null
  // (legacy rows or OTR fallbacks without a precise lat/lng).
  const geoLat = cycle.lat ?? job.domicileLat;
  const geoLng = cycle.lng ?? job.domicileLng;

  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    title: job.positionTitle,
    description,
    // Per Google for Jobs: datePosted is when THIS posting went live,
    // validThrough is when it stops being valid. The cycle table owns
    // both — reposts get a fresh datePosted so Google sees them as new.
    datePosted: new Date(cycle.postedAt).toISOString(),
    validThrough: new Date(cycle.expiresAt).toISOString(),
    employmentType: "FULL_TIME",
    identifier: {
      "@type": "PropertyValue",
      name: carrierName,
      value: cycle.id,
    },
    hiringOrganization: {
      "@type": "Organization",
      name: carrierName,
      sameAs,
    },
    jobLocation: {
      "@type": "Place",
      address: {
        "@type": "PostalAddress",
        addressLocality: cycle.city,
        addressRegion: cycle.state,
        postalCode:
          cycle.zip ??
          (cycle.city.toLowerCase() === job.domicileCity.toLowerCase() &&
          cycle.state.toUpperCase() === job.domicileState.toUpperCase()
            ? job.domicileZip ?? undefined
            : undefined),
        addressCountry: "US",
      },
      geo:
        geoLat && geoLng
          ? {
              "@type": "GeoCoordinates",
              latitude: Number(geoLat),
              longitude: Number(geoLng),
            }
          : undefined,
    },
    ...(job.hiringRadiusMiles == null
      ? {
          applicantLocationRequirements: {
            "@type": "Country",
            name: "United States",
          },
          jobLocationType: "TELECOMMUTE",
        }
      : {}),
    baseSalary,
    occupationalCategory: "53-3032 Heavy and Tractor-Trailer Truck Drivers",
    industry: "Trucking",
    url: `${SITE_ORIGIN}/job/${slug}`,
    directApply: false,
    experienceRequirements:
      job.minExperienceMonths > 0
        ? {
            "@type": "OccupationalExperienceRequirements",
            monthsOfExperience: job.minExperienceMonths,
          }
        : undefined,
    qualifications: buildQualificationsList(job),
    responsibilities: buildResponsibilitiesList(job),
    skills: `Class A CDL, ${deriveEquipmentNoun(job)} operation, DOT compliance, electronic logging (ELD), pre-trip and post-trip inspections, safe defensive driving`,
  };
}

function buildQualificationsList(job: JobRow): string {
  const parts: string[] = [
    "Valid Class A CDL",
    "Current DOT medical certificate",
    "Clean MVR within the carrier's published bar",
  ];
  if (job.minExperienceMonths > 0) {
    parts.push(
      `${job.minExperienceMonths} months verifiable CDL-A driving experience`,
    );
  }
  if (job.requiredEndorsements.length > 0) {
    parts.push(
      `Endorsements: ${job.requiredEndorsements.join(", ").toUpperCase()}`,
    );
  }
  if (!job.acceptsDui) parts.push("No DUI history");
  if (!job.acceptsFelony) parts.push("No felony convictions");
  if (!job.acceptsTerminated) {
    parts.push("Not currently terminated from your last driving job");
  }
  return parts.join("; ");
}

function buildResponsibilitiesList(job: JobRow): string {
  const equipment = deriveEquipmentNoun(job).toLowerCase();
  return [
    `Operate a Class A CDL tractor pulling ${equipment} equipment`,
    "Complete pre-trip and post-trip inspections per DOT/FMCSA",
    "Maintain electronic logs and hours-of-service compliance",
    "Communicate with dispatch and shippers/receivers",
    "Secure freight and operate safely in all conditions",
  ].join("; ");
}

export async function generateStaticParams() {
  // Prerender every ACTIVE cycle's slug. Expired cycles aren't
  // rendered — they 404 so Google drops them from the index.
  //
  // Wrapped in try/catch so a missing table (e.g., during the deploy
  // window between code push and migration apply) or a Neon hiccup
  // doesn't fail the entire build. Returning [] just means zero
  // prerendered job pages; they still render on-demand via ISR.
  let rows: Array<{
    cycleId: string;
    city: string;
    state: string;
    name: string;
    positionTitle: string;
  }> = [];
  try {
    rows = await db
      .select({
        cycleId: jobPostingCycles.id,
        city: jobPostingCycles.city,
        state: jobPostingCycles.state,
        name: carriers.name,
        positionTitle: carrierJobs.positionTitle,
      })
      .from(jobPostingCycles)
      .innerJoin(carrierJobs, eq(carrierJobs.id, jobPostingCycles.jobId))
      .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
      .where(
        and(
          eq(jobPostingCycles.status, "active"),
          eq(carrierJobs.status, "active"),
        ),
      )
      .limit(20_000);
  } catch (err) {
    console.warn(
      `[job/[slug]] generateStaticParams skipped — DB query failed (${err instanceof Error ? err.message : String(err)}). Pages will render on-demand via ISR.`,
    );
    return [];
  }

  return rows.map((r) => ({
    slug: buildJobPostingSlug(
      { name: r.name },
      {
        // The slug's id suffix is the CYCLE id (not the job id).
        id: r.cycleId,
        positionTitle: r.positionTitle,
        domicileCity: r.city,
        domicileState: r.state,
      },
    ),
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadCycleFromSlug(slug);
  if (!loaded) return {};

  const seo = generateSeoCopy({
    job: loaded.job,
    carrier: loaded.carrier,
    city: loaded.cycle.city,
    state: loaded.cycle.state,
    variantIndex: loaded.cycle.variantIndex,
  });

  const canonicalSlug = buildJobPostingSlug(
    loaded.carrier,
    {
      id: loaded.cycle.id,
      positionTitle: loaded.job.positionTitle,
      domicileCity: loaded.cycle.city,
      domicileState: loaded.cycle.state,
    },
  );
  const canonical = `${SITE_ORIGIN}/job/${canonicalSlug}`;

  return {
    title: seo.pageTitle,
    description: seo.metaDescription,
    alternates: { canonical },
    openGraph: {
      title: seo.pageTitle,
      description: seo.metaDescription,
      url: canonical,
      siteName: "CDLA.jobs",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: seo.pageTitle,
      description: seo.metaDescription,
    },
    robots: { index: true, follow: true },
  };
}

export default async function JobPostingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadCycleFromSlug(slug);
  if (!loaded) notFound();
  const { cycle, job, carrier } = loaded;
  const carrierName = displayCarrierName(carrier.name);
  const seo = generateSeoCopy({
    job,
    carrier,
    city: cycle.city,
    state: cycle.state,
    variantIndex: cycle.variantIndex,
  });
  const equipment = deriveEquipmentNoun(job);

  const min = job.displayPayRangeMinWeeklyUsd;
  const max = job.displayPayRangeMaxWeeklyUsd ?? job.payRangeMaxWeeklyUsd;
  const payLabel =
    min != null && max != null
      ? `$${min.toLocaleString()}–$${max.toLocaleString()} / week`
      : max != null
        ? `Up to $${max.toLocaleString()} / week`
        : "Pay not published";

  const radius =
    job.hiringRadiusMiles == null
      ? "Hires nationwide (OTR)"
      : `Hires within ${job.hiringRadiusMiles} miles of ${job.domicileCity}, ${job.domicileState}`;

  // If the URL we're rendering uses a city other than the job's
  // domicile, mention it so drivers and Google both see the same
  // candid framing — this is a posting in <City>, the carrier's
  // primary domicile is <DomicileCity>.
  const isDomicile =
    cycle.city.toLowerCase() === job.domicileCity.toLowerCase() &&
    cycle.state.toUpperCase() === job.domicileState.toUpperCase();

  const jsonLd = jobPostingJsonLd({
    loaded,
    slug,
    description: seo.jsonLdDescription,
  });

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-brand-muted">
          <Link
            href={`/carriers/${buildCarrierSlug(carrier)}`}
            className="hover:text-brand-ink hover:underline"
          >
            {carrierName}
          </Link>
          {" · "}
          {seo.laneNoun} {equipment}
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
          {seo.h1}
        </h1>
        <p className="mt-3 text-base text-brand-muted">
          {cycle.city}, {cycle.state} · Class A CDL · {seo.laneNoun}{" "}
          {equipment} Driver
        </p>

        <dl className="mt-8 grid grid-cols-1 gap-5 rounded-2xl border border-brand-rule bg-brand-surface px-5 py-5 sm:grid-cols-3 sm:px-6">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Pay
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-ink">
              {payLabel}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Equipment
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-ink">
              {equipment}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              {isDomicile ? "Domicile" : "Hiring area"}
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-ink">
              {cycle.city}, {cycle.state}
            </dd>
            <dd className="text-xs text-brand-muted">
              {isDomicile
                ? radius
                : `Domiciled at ${job.domicileCity}, ${job.domicileState} — ${radius.toLowerCase()}`}
            </dd>
          </div>
        </dl>

        <Section title="Overview">
          <p>{seo.visibleIntro}</p>
        </Section>

        {job.displayLaneDescription ? (
          <Section title="Lane">
            <p>{job.displayLaneDescription}</p>
          </Section>
        ) : null}

        {job.description ? (
          <Section title={`About this ${seo.laneNoun.toLowerCase()} CDL-A job`}>
            <p className="whitespace-pre-line">{job.description}</p>
          </Section>
        ) : null}

        {job.displayHomeTimeDescription ? (
          <Section title="Home time">
            <p>{job.displayHomeTimeDescription}</p>
          </Section>
        ) : null}

        {job.displayBenefitsSummary ? (
          <Section title="Pay and benefits">
            <p>{job.displayBenefitsSummary}</p>
          </Section>
        ) : null}

        {job.displaySigningBonusUsd && job.displaySigningBonusUsd > 0 ? (
          <Section title="Signing bonus">
            <p className="font-medium text-brand-ink">
              ${job.displaySigningBonusUsd.toLocaleString()}
            </p>
          </Section>
        ) : null}

        <Section title="Requirements">
          <ul className="ml-5 list-disc space-y-1.5">
            <li>
              {job.minExperienceMonths > 0
                ? `${job.minExperienceMonths} months of verifiable Class A CDL driving experience`
                : "Open to recent Class A CDL graduates"}
            </li>
            {job.requiredEndorsements.length > 0 ? (
              <li>
                Required endorsements:{" "}
                {job.requiredEndorsements.join(", ").toUpperCase()}
              </li>
            ) : null}
            {job.maxTickets3yr != null ? (
              <li>
                Max {job.maxTickets3yr} moving violations in the last 3 years
              </li>
            ) : null}
            {job.maxAccidents3yr != null ? (
              <li>Max {job.maxAccidents3yr} accidents in the last 3 years</li>
            ) : null}
            <li>
              DUI:{" "}
              {job.acceptsDui
                ? job.duiMaxRecencyMonths
                  ? `accepted if older than ${Math.round(job.duiMaxRecencyMonths / 12)} years`
                  : "accepted (case by case)"
                : "not accepted"}
            </li>
            <li>
              Felony:{" "}
              {job.acceptsFelony ? "reviewed case by case" : "not accepted"}
            </li>
            <li>
              Prior termination:{" "}
              {job.acceptsTerminated
                ? "case-by-case review"
                : "not accepted from last driving job"}
            </li>
          </ul>
        </Section>

        <Section title="Why apply through CDLA.jobs">
          <p>
            CDLA.jobs is a driver-matching platform. You fill out one
            6-minute intake and we run it against every carrier that
            matches what you want. {carrierName} is one of the carriers
            we&rsquo;re working with. We never share your information
            with a carrier until you say it&rsquo;s ok.
          </p>
        </Section>

        <div className="mt-10 rounded-2xl border border-brand-deep/15 bg-brand-deep/[0.03] p-6">
          <h2 className="text-lg font-semibold text-brand-deep">
            Apply through CDLA.jobs
          </h2>
          <p className="mt-2 text-sm leading-6 text-brand-ink">
            One 6-minute intake covers this job and any other carrier you
            match with. You decide who sees your information before
            anything goes to {carrierName}.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Link
              href="/intake"
              className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium"
            >
              Start the 6-minute intake
            </Link>
            <Link
              href="/login"
              className="inline-flex h-11 items-center justify-center rounded-md border border-brand-rule bg-white px-4 text-sm font-medium text-brand-ink hover:border-brand-medium hover:bg-brand-surface"
            >
              Already started — sign in
            </Link>
          </div>
        </div>

        <p className="mt-8 text-xs text-brand-muted">
          Posted{" "}
          {new Date(cycle.postedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          . This posting expires{" "}
          {new Date(cycle.expiresAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          . Carriers decide who they hire — CDLA.jobs does not.
        </p>
      </article>
    </SiteShell>
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
    <section className="mt-8">
      <h2 className="text-xs uppercase tracking-wide text-brand-muted">
        {title}
      </h2>
      <div className="mt-2 text-sm leading-6 text-brand-ink">{children}</div>
    </section>
  );
}
