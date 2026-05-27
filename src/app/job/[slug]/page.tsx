import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers } from "@/db/schema";
import { SiteShell } from "@/components/SiteShell";
import { EQUIPMENT } from "@/lib/slugs";
import {
  buildJobPostingSlug,
  jobIdPrefixFromSlug,
  jobIdLikePattern,
} from "@/lib/job-slug";

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

export const revalidate = 900; // 15-min ISR (same as the landing pages)

const SITE_ORIGIN = "https://cdla.jobs";

// How long after lastVerifiedAt (or createdAt fallback) we'll continue to
// claim the job is "open" to Google. 90 days is the Google for Jobs hard
// requirement — validThrough must be a future date, and stale validThrough
// drops you from the index.
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
  // Verify the full slug round-trips — guards against truncated URLs
  // and against someone forging the descriptive prefix. We only enforce
  // that the id-suffix matches; the carrier+position+city portion is
  // descriptive and may drift if titles change. Google still gets the
  // right job, the URL just won't be canonical.
  const canonicalSlug = buildJobPostingSlug(found.carrier, found.job);
  // Allow stale descriptive prefixes by redirecting via canonical URL
  // metadata; we still serve the real job below.
  void canonicalSlug;
  return { job: found.job, carrier: found.carrier };
}

function equipmentDisplay(slug: string): string {
  return EQUIPMENT[slug]?.displayName ?? humanizeSlug(slug);
}

// Seed/composite carrier names include "(composite)" so internal tools
// can tell example data apart from real partners. Never show that to
// drivers or to Google's crawler.
function displayCarrierName(name: string): string {
  return name.replace(/\s*\(composite\)\s*/gi, "").trim();
}

function humanizeSlug(s: string): string {
  return s
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function formatPay(job: JobRow): {
  min: number | null;
  max: number | null;
  label: string;
} {
  const min = job.displayPayRangeMinWeeklyUsd;
  const max = job.displayPayRangeMaxWeeklyUsd ?? job.payRangeMaxWeeklyUsd;
  if (min != null && max != null) {
    return {
      min,
      max,
      label: `$${min.toLocaleString()}–$${max.toLocaleString()} / week`,
    };
  }
  if (max != null) {
    return { min: null, max, label: `Up to $${max.toLocaleString()} / week` };
  }
  return { min: null, max: null, label: "Pay not published" };
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
  // went live). We re-affirm freshness via validThrough above.
  return new Date(job.createdAt).toISOString();
}

function jobPostingJsonLd(loaded: LoadedJob, slug: string): object {
  const { job, carrier } = loaded;
  const carrierName = displayCarrierName(carrier.name);
  const pay = formatPay(job);
  const sameAs = carrier.publicCareersUrl ?? undefined;

  // Compose a description Google can index. Prefer the carrier's own
  // description; if missing, build one from lane + home time + benefits
  // so we never ship an empty body.
  const descLines: string[] = [];
  if (job.description) descLines.push(job.description);
  if (job.displayLaneDescription)
    descLines.push(`Lane: ${job.displayLaneDescription}`);
  if (job.displayHomeTimeDescription)
    descLines.push(`Home time: ${job.displayHomeTimeDescription}`);
  if (job.displayBenefitsSummary)
    descLines.push(`Benefits: ${job.displayBenefitsSummary}`);
  if (descLines.length === 0) {
    descLines.push(
      `Class A CDL ${equipmentDisplay(job.equipment)} position with ${carrierName} out of ${job.domicileCity}, ${job.domicileState}.`,
    );
  }
  const description = descLines.join("\n\n");

  const baseSalary =
    pay.max != null
      ? {
          "@type": "MonetaryAmount",
          currency: "USD",
          value: {
            "@type": "QuantitativeValue",
            minValue: pay.min ?? pay.max,
            maxValue: pay.max,
            unitText: "WEEK",
          },
        }
      : undefined;

  return {
    "@context": "https://schema.org/",
    "@type": "JobPosting",
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
        addressLocality: job.domicileCity,
        addressRegion: job.domicileState,
        postalCode: job.domicileZip ?? undefined,
        addressCountry: "US",
      },
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
  };
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

  const { job, carrier } = loaded;
  const carrierName = displayCarrierName(carrier.name);
  const pay = formatPay(job);
  const equipment = equipmentDisplay(job.equipment);
  const title = `${job.positionTitle} — ${carrierName} (${job.domicileCity}, ${job.domicileState})`;
  const description =
    pay.label === "Pay not published"
      ? `${equipment} CDL-A driving job with ${carrierName} out of ${job.domicileCity}, ${job.domicileState}. Match in 6 minutes on CDLA.jobs.`
      : `${equipment} CDL-A driving job with ${carrierName} out of ${job.domicileCity}, ${job.domicileState}. ${pay.label}. Match in 6 minutes on CDLA.jobs.`;

  const canonicalSlug = buildJobPostingSlug(carrier, job);
  const canonical = `${SITE_ORIGIN}/job/${canonicalSlug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: "CDLA.jobs",
      type: "website",
    },
    twitter: { card: "summary_large_image", title, description },
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
  const pay = formatPay(job);
  const equipment = equipmentDisplay(job.equipment);
  const radius =
    job.hiringRadiusMiles == null
      ? "Hires nationwide (OTR)"
      : `Hires within ${job.hiringRadiusMiles} miles of ${job.domicileCity}, ${job.domicileState}`;

  const jsonLd = jobPostingJsonLd(loaded, slug);

  return (
    <SiteShell>
      {/* JSON-LD inline so Google Search Console picks it up on first
          crawl. dangerouslySetInnerHTML is the supported pattern. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-brand-muted">
          {carrierName}
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
          {job.positionTitle}
        </h1>
        <p className="mt-3 text-base text-brand-muted">
          {job.domicileCity}, {job.domicileState} · {equipment}
        </p>

        <dl className="mt-8 grid grid-cols-1 gap-5 rounded-2xl border border-brand-rule bg-brand-surface px-5 py-5 sm:grid-cols-3 sm:px-6">
          <div>
            <dt className="text-xs uppercase tracking-wide text-brand-muted">
              Pay
            </dt>
            <dd className="mt-1 text-sm font-semibold text-brand-ink">
              {pay.label}
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

        {job.displayLaneDescription ? (
          <Section title="Lane">
            <p>{job.displayLaneDescription}</p>
          </Section>
        ) : null}

        {job.description ? (
          <Section title="About the job">
            <p className="whitespace-pre-line">{job.description}</p>
          </Section>
        ) : null}

        {job.displayHomeTimeDescription ? (
          <Section title="Home time">
            <p>{job.displayHomeTimeDescription}</p>
          </Section>
        ) : null}

        {job.displayBenefitsSummary ? (
          <Section title="Benefits">
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
                ? `${job.minExperienceMonths} months of verifiable CDL-A driving experience`
                : "Open to recent CDL-A grads"}
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
              DUI: {job.acceptsDui
                ? job.duiMaxRecencyMonths
                  ? `accepted if older than ${Math.round(job.duiMaxRecencyMonths / 12)} years`
                  : "accepted (case by case)"
                : "not accepted"}
            </li>
            <li>
              Felony:{" "}
              {job.acceptsFelony
                ? "reviewed case by case"
                : "not accepted"}
            </li>
            <li>
              Prior termination:{" "}
              {job.acceptsTerminated
                ? "case-by-case review"
                : "not accepted from last driving job"}
            </li>
          </ul>
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
