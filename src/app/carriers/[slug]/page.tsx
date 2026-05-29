import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  jobPostingCycles,
} from "@/db/schema";
import { SiteShell } from "@/components/SiteShell";
import { buildCarrierSlug } from "@/lib/carrier-slug";
import { buildJobPostingSlug } from "@/lib/job-slug";
import { displayCarrierName, deriveLaneNoun, deriveEquipmentNoun } from "@/lib/job-seo-copy";

// /carriers/[slug] — one profile page per active carrier listing all
// their active jobs. Driver-facing: "browse all C.R. England openings."
// Also good SEO surface for "Swift Transportation jobs" queries that
// don't include a specific city/equipment combo.
//
// Each page carries Organization JSON-LD for Google. Individual jobs
// linked here still have their own JobPosting JSON-LD on /job/[slug].

export const revalidate = 900; // 15-min ISR

const SITE_ORIGIN = "https://www.cdla.jobs";

type CarrierRow = typeof carriers.$inferSelect;

async function loadCarrierBySlug(
  slug: string,
): Promise<{ carrier: CarrierRow; primaryCycles: PrimaryCycleRow[] } | null> {
  // Carrier name → slug isn't stored on the row, so we list candidates
  // and match by slug match. Acceptable at our scale (under 100
  // carriers); switch to a stored carrier_slug column if we ever
  // grow past that.
  const allCarriers = await db
    .select()
    .from(carriers)
    .where(eq(carriers.status, "active"));
  const carrier = allCarriers.find((c) => buildCarrierSlug(c) === slug);
  if (!carrier) return null;

  // Get the primary active cycle per active job for this carrier.
  // We surface one URL per job (the primary cycle), not every
  // secondary multi-city cycle — that'd be visually noisy.
  const rows = (await db.execute(sql`
    SELECT DISTINCT ON (j.id)
      j.id              AS job_id,
      j.position_title  AS position_title,
      j.equipment       AS equipment,
      j.domicile_city   AS domicile_city,
      j.domicile_state  AS domicile_state,
      j.pay_range_max_weekly_usd AS pay_max,
      j.display_pay_range_min_weekly_usd AS pay_min,
      j.accepted_home_time_types AS accepted_home_time_types,
      c.id              AS cycle_id,
      c.city            AS cycle_city,
      c.state           AS cycle_state
    FROM carrier_jobs j
    JOIN job_posting_cycles c ON c.job_id = j.id
    WHERE j.carrier_id = ${carrier.id}
      AND j.status = 'active'
      AND c.status = 'active'
    ORDER BY j.id, c.is_primary DESC, c.posted_at DESC
  `)) as unknown as PrimaryCycleRow[];

  return { carrier, primaryCycles: rows };
}

interface PrimaryCycleRow {
  job_id: string;
  position_title: string;
  equipment: string;
  domicile_city: string;
  domicile_state: string;
  pay_max: number | null;
  pay_min: number | null;
  accepted_home_time_types: string[];
  cycle_id: string;
  cycle_city: string;
  cycle_state: string;
}

export async function generateStaticParams() {
  // Try/catch so a DB hiccup at build time never fails the deploy;
  // routes still resolve on-demand via ISR.
  try {
    const rows = await db
      .select({ name: carriers.name })
      .from(carriers)
      .where(eq(carriers.status, "active"));
    return rows
      .filter((r) => !/composite/i.test(r.name))
      .map((r) => ({ slug: buildCarrierSlug(r) }));
  } catch (err) {
    console.warn(
      `[carriers/[slug]] generateStaticParams skipped — DB query failed (${
        err instanceof Error ? err.message : String(err)
      }).`,
    );
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadCarrierBySlug(slug);
  if (!loaded) return {};
  const name = displayCarrierName(loaded.carrier.name);
  const count = loaded.primaryCycles.length;
  const title = `${name} — ${count} CDL-A driver job${count === 1 ? "" : "s"}`;
  const description = `Browse ${count} Class A CDL driving job${
    count === 1 ? "" : "s"
  } at ${name}. Match in 6 minutes on CDLA.jobs.`;
  const canonical = `${SITE_ORIGIN}/carriers/${slug}`;
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
    robots: { index: true, follow: true },
  };
}

export default async function CarrierProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const loaded = await loadCarrierBySlug(slug);
  if (!loaded) notFound();
  const { carrier, primaryCycles } = loaded;
  const name = displayCarrierName(carrier.name);

  // Group jobs by state for a tidy list. Cycle's domicile city/state
  // (where the URL points) wins for grouping; the underlying job's
  // domicile is shown only as supplementary info.
  const byState = new Map<string, PrimaryCycleRow[]>();
  for (const r of primaryCycles) {
    const list = byState.get(r.cycle_state) ?? [];
    list.push(r);
    byState.set(r.cycle_state, list);
  }
  const states = [...byState.keys()].sort();

  const orgJsonLd = {
    "@context": "https://schema.org/",
    "@type": "Organization",
    name,
    url: carrier.publicCareersUrl ?? `${SITE_ORIGIN}/carriers/${slug}`,
    sameAs: carrier.publicCareersUrl ? [carrier.publicCareersUrl] : undefined,
    industry: "Trucking",
    address: {
      "@type": "PostalAddress",
      addressCountry: "US",
    },
  };

  return (
    <SiteShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-brand-muted">
          Carrier profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
          {name}
        </h1>
        <p className="mt-3 text-base text-brand-muted">
          {primaryCycles.length} active Class A CDL driver job
          {primaryCycles.length === 1 ? "" : "s"} across {states.length} state
          {states.length === 1 ? "" : "s"}.
        </p>

        <div className="mt-6">
          <Link
            href="/intake"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium transition-colors"
          >
            Match with {name} in 6 minutes
          </Link>
        </div>

        {states.length === 0 ? (
          <section className="mt-10 rounded-2xl border border-brand-rule bg-brand-surface p-6">
            <p className="text-sm leading-6 text-brand-ink">
              {name} doesn&rsquo;t have any active openings right now.
              We&rsquo;ll add new postings here as they come in. Start your
              intake and we&rsquo;ll let you know when {name} (or any other
              carrier) starts hiring for what you want.
            </p>
          </section>
        ) : (
          states.map((state) => {
            const jobs = byState.get(state)!;
            return (
              <section key={state} className="mt-10">
                <h2 className="text-sm uppercase tracking-wide text-brand-muted">
                  {state} · {jobs.length} job{jobs.length === 1 ? "" : "s"}
                </h2>
                <ul className="mt-3 flex flex-col gap-3">
                  {jobs.map((j) => {
                    const cycleSlug = buildJobPostingSlug(
                      { name: carrier.name },
                      {
                        id: j.cycle_id,
                        positionTitle: j.position_title,
                        domicileCity: j.cycle_city,
                        domicileState: j.cycle_state,
                      },
                    );
                    const fakeJob = {
                      positionTitle: j.position_title,
                      equipment: j.equipment,
                      hiringRadiusMiles: 100,
                      acceptedHomeTimeTypes: (j.accepted_home_time_types ?? []) as (
                        | "daily"
                        | "weekly"
                        | "biweekly"
                        | "otr"
                      )[],
                    } as Parameters<typeof deriveLaneNoun>[0];
                    const lane = deriveLaneNoun(fakeJob);
                    const equipment = deriveEquipmentNoun(fakeJob);
                    return (
                      <li key={j.cycle_id}>
                        <Link
                          href={`/job/${cycleSlug}`}
                          className="block rounded-xl border border-brand-rule bg-white p-4 hover:border-brand-medium hover:bg-brand-surface transition-colors"
                        >
                          <p className="text-sm font-semibold text-brand-ink">
                            {j.position_title}
                          </p>
                          <p className="mt-1 text-xs text-brand-muted">
                            {j.cycle_city}, {j.cycle_state} · {lane} {equipment}
                            {j.pay_max
                              ? ` · ${
                                  j.pay_min
                                    ? `$${j.pay_min.toLocaleString()}–$${j.pay_max.toLocaleString()}`
                                    : `Up to $${j.pay_max.toLocaleString()}`
                                } / week`
                              : ""}
                          </p>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })
        )}

        <Section title="Why match through CDLA.jobs">
          <p>
            One 6-minute intake covers every {name} opening above and any
            other carrier you match with. You decide who sees your info
            before anything goes to {name}.
          </p>
        </Section>

        {carrier.publicCareersUrl ? (
          <p className="mt-8 text-xs text-brand-muted">
            {name}&rsquo;s public careers site:{" "}
            <a
              href={carrier.publicCareersUrl}
              className="underline hover:text-brand-ink"
            >
              {carrier.publicCareersUrl}
            </a>
            . CDLA.jobs lets you compare them to other carriers in one place.
          </p>
        ) : null}
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
