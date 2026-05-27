import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers } from "@/db/schema";
import { SiteShell } from "@/components/SiteShell";
import {
  buildJobPostingSlug,
  jobIdPrefixFromSlug,
  jobIdLikePattern,
} from "@/lib/job-slug";
import {
  generateSeoCopy,
  deriveEquipmentNoun,
  displayCarrierName,
} from "@/lib/job-seo-copy";

// Individual job-posting pages live here. The /jobs/[region-equipment]
// landing pages above are SEO funnels for paid + organic — they aggregate
// "carriers hiring reefer drivers in Atlanta" style queries. This file
// is the other kind of page Google for Jobs wants: one URL per *real
// posting*, with full JobPosting structured data so it can syndicate to
// google.com/jobs.
//
// Per docs/SPEC_homepage-copy-v1.md §9.5: JobPosting schema belongs on
// individual job pages only — never on the homepage or aggregate /jobs
// pages.
//
// Copy generation (titles, descriptions, body copy) lives in
// @/lib/job-seo-copy so Phase 2 (posting cycles + city rotation) can
// feed it a different city + variant index per repost cycle without
// rewriting this file.

export const revalidate = 900; // 15-min ISR (same as the landing pages)

const SITE_ORIGIN = "https://cdla.jobs";

// How long after lastVerifiedAt (or createdAt fallback) we'll continue to
// claim the job is "open" to Google. 90 days is the Google for Jobs hard
// requirement — validThrough must be a future date, and stale validThrough
// drops you from the index.
//
// Phase 2 will replace this with a per-cycle expires_at (20 days from
// posted_at) sourced from job_posting_cycles. Until that ships, 90 days
// from last_verified_at is the right fallback.
const VALID_THROUGH_DAYS = 90;

type JobRow = typeof carrierJobs.$inferSelect;
type CarrierRow = typeof carriers.$inferSelect;

interface LoadedJob {
  job: JobRow;
  carrier: CarrierRow;
}

async function loadJobFromSlug(slug: string): Promise<LoadedJob | null> {
  const prefix = jobIdPrefixFromSlug(slug);
  if (!prefix) return null;

  const rows = await db
    .select({
      job: carrierJobs,
      carrier: carriers,
    })
    .from(carrierJobs)
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(
      and(
        like(sql`${carrierJobs.id}::text`, jobIdLikePattern(prefix)),
        eq(carrierJobs.status, "active"),
      ),
    )
    .limit(2);

  // Defensive: an 8-char prefix is unique in practice, but if two rows
  // collide we'd rather 404 than show the wrong job.
  if (rows.length !== 1) return null;

  const found = rows[0];
  return { job: found.job, carrier: found.carrier };
}

function validThroughISO(job: JobRow): string {
  const base = job.lastVerifiedAt ?? job.createdAt;
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + VALID_THROUGH_DAYS);
  // If validThrough has already passed, Google drops the posting. Bump
  // forward 30 days from "now" so re-verified jobs get a fresh window
  // without us re-touching every row.
  if (d.getTime() < Date.now()) {
    const future = new Date();
    future.setUTCDate(future.getUTCDate() + 30);
    return future.toISOString();
  }
  return d.toISOString();
}

function datePostedISO(job: JobRow): string {
  // Use createdAt for datePosted (Google wants the date the listing first
  // went live). We re-affirm freshness via validThrough above. Phase 2's
  // posting cycles will override this with the cycle's posted_at so each
  // repost looks fresh to Google.
  return new Date(job.createdAt).toISOString();
}

interface JsonLdContext {
  loaded: LoadedJob;
  slug: string;
  city: string;
  state: string;
  description: string;
}

function jobPostingJsonLd(ctx: JsonLdContext): object {
  const { loaded, slug, city, state, description } = ctx;
  const { job, carrier } = loaded;
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

  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
    // Title field per Google's spec: job title only, no location/company.
    // The page <title> tag has the SEO-optimized longer form.
    title: job.positionTitle,
    description,
    datePosted: datePostedISO(job),
    validThrough: validThroughISO(job),
    employmentType: "FULL_TIME",
    identifier: {
      "@type": "PropertyValue",
      name: carrierName,
      value: job.id,
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
        addressLocality: city,
        addressRegion: state,
        // Only include postalCode when the city we're rendering matches
        // the domicile we have a zip for — otherwise we'd be lying about
        // the precise location.
        postalCode:
          job.domicileZip &&
          city.toLowerCase() === job.domicileCity.toLowerCase() &&
          state.toUpperCase() === job.domicileState.toUpperCase()
            ? job.domicileZip
            : undefined,
        addressCountry: "US",
      },
      geo:
        job.domicileLat && job.domicileLng
          ? {
              "@type": "GeoCoordinates",
              latitude: Number(job.domicileLat),
              longitude: Number(job.domicileLng),
            }
          : undefined,
    },
    // OTR jobs (no fixed hiring radius) advertise nationwide hiring per
    // Google's `applicantLocationRequirements` spec, which they recommend
    // when jobLocation isn't where the work happens.
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
  // Pre-render every active job so first byte is cached HTML. Vercel
  // will skip params not returned here at build time and render on
  // demand (we still get ISR via `revalidate`).
  const rows = await db
    .select({
      id: carrierJobs.id,
      name: carriers.name,
      positionTitle: carrierJobs.positionTitle,
      domicileCity: carrierJobs.domicileCity,
      domicileState: carrierJobs.domicileState,
    })
    .from(carrierJobs)
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(eq(carrierJobs.status, "active"))
    .limit(5000);

  return rows.map((r) => ({
    slug: buildJobPostingSlug(
      { name: r.name },
      {
        id: r.id,
        positionTitle: r.positionTitle,
        domicileCity: r.domicileCity,
        domicileState: r.domicileState,
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
  const loaded = await loadJobFromSlug(slug);
  if (!loaded) return {};

  const seo = generateSeoCopy({
    job: loaded.job,
    carrier: loaded.carrier,
    city: loaded.job.domicileCity,
    state: loaded.job.domicileState,
    variantIndex: 0,
  });

  const canonicalSlug = buildJobPostingSlug(loaded.carrier, loaded.job);
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
  const loaded = await loadJobFromSlug(slug);
  if (!loaded) notFound();
  const { job, carrier } = loaded;
  const carrierName = displayCarrierName(carrier.name);
  const seo = generateSeoCopy({
    job,
    carrier,
    city: job.domicileCity,
    state: job.domicileState,
    variantIndex: 0,
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

  const jsonLd = jobPostingJsonLd({
    loaded,
    slug,
    city: job.domicileCity,
    state: job.domicileState,
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
          {carrierName} · {seo.laneNoun} {equipment}
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
          {seo.h1}
        </h1>
        <p className="mt-3 text-base text-brand-muted">
          {job.domicileCity}, {job.domicileState} · Class A CDL ·{" "}
          {seo.laneNoun} {equipment} Driver
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
              Domicile
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-ink">
              {job.domicileCity}, {job.domicileState}
            </dd>
            <dd className="text-xs text-brand-muted">{radius}</dd>
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
            we're working with. We never share your information with a
            carrier until you say it's ok.
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

        {job.lastVerifiedAt ? (
          <p className="mt-8 text-xs text-brand-muted">
            Listing last verified{" "}
            {new Date(job.lastVerifiedAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
            . Carriers decide who they hire — CDLA.jobs does not.
          </p>
        ) : (
          <p className="mt-8 text-xs text-brand-muted">
            Carriers decide who they hire — CDLA.jobs does not.
          </p>
        )}
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
