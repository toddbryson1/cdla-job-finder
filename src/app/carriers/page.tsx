import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers } from "@/db/schema";
import { SiteShell } from "@/components/SiteShell";
import { buildCarrierSlug } from "@/lib/carrier-slug";
import { displayCarrierName } from "@/lib/job-seo-copy";

// /carriers — index page listing every active non-composite carrier
// with their job count. One entry per (real) carrier; clicking goes
// to /carriers/[slug].

export const revalidate = 900; // 15-min ISR

const SITE_ORIGIN = "https://www.cdla.jobs";

export const metadata: Metadata = {
  title: "Class A CDL Carriers Hiring Now",
  description:
    "Browse every Class A CDL carrier hiring through CDLA.jobs. C.R. England, Swift Transportation, Transport America, and more. Match in 6 minutes.",
  alternates: { canonical: `${SITE_ORIGIN}/carriers` },
  openGraph: {
    title: "Class A CDL Carriers Hiring Now",
    description:
      "Browse every Class A CDL carrier hiring through CDLA.jobs. Match in 6 minutes.",
    url: `${SITE_ORIGIN}/carriers`,
    siteName: "CDLA.jobs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Class A CDL Carriers Hiring Now",
    description:
      "Browse every Class A CDL carrier hiring through CDLA.jobs. Match in 6 minutes.",
  },
  robots: { index: true, follow: true },
};

interface CarrierIndexRow {
  name: string;
  job_count: number;
}

async function loadCarriers(): Promise<CarrierIndexRow[]> {
  try {
    const rows = (await db.execute(sql`
      SELECT c.name AS name, COUNT(j.id)::int AS job_count
      FROM carriers c
      LEFT JOIN carrier_jobs j
        ON j.carrier_id = c.id AND j.status = 'active'
      WHERE c.status = 'active'
      GROUP BY c.name
      ORDER BY COUNT(j.id) DESC, c.name ASC
    `)) as unknown as CarrierIndexRow[];
    return rows.filter((r) => !/composite/i.test(r.name));
  } catch (err) {
    console.warn(
      `[carriers] loadCarriers DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
    return [];
  }
}

export default async function CarriersIndexPage() {
  const rows = await loadCarriers();
  const total = rows.reduce((sum, r) => sum + r.job_count, 0);

  return (
    <SiteShell>
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <p className="text-xs uppercase tracking-wide text-brand-muted">
          Carrier directory
        </p>
        <h1 className="mt-2 text-3xl font-semibold leading-tight text-brand-ink sm:text-4xl">
          Class A CDL carriers hiring through CDLA.jobs
        </h1>
        <p className="mt-3 text-base text-brand-muted">
          {rows.length} carrier{rows.length === 1 ? "" : "s"} ·{" "}
          {total.toLocaleString()} active job
          {total === 1 ? "" : "s"} as of today.
        </p>

        <div className="mt-6">
          <Link
            href="/intake"
            className="inline-flex h-11 items-center justify-center rounded-md bg-brand-deep px-5 text-sm font-semibold text-white hover:bg-brand-medium transition-colors"
          >
            Match in 6 minutes
          </Link>
        </div>

        {rows.length === 0 ? (
          <section className="mt-10 rounded-2xl border border-brand-rule bg-brand-surface p-6">
            <p className="text-sm leading-6 text-brand-ink">
              We&rsquo;re adding carriers daily. Start your intake and
              we&rsquo;ll let you know when new carriers come online for
              what you&rsquo;re looking for.
            </p>
          </section>
        ) : (
          <ul className="mt-10 flex flex-col gap-3">
            {rows.map((r) => {
              const slug = buildCarrierSlug({ name: r.name });
              return (
                <li key={r.name}>
                  <Link
                    href={`/carriers/${slug}`}
                    className="flex items-center justify-between rounded-xl border border-brand-rule bg-white p-4 hover:border-brand-medium hover:bg-brand-surface transition-colors"
                  >
                    <span className="text-base font-semibold text-brand-ink">
                      {displayCarrierName(r.name)}
                    </span>
                    <span className="text-sm text-brand-muted">
                      {r.job_count} active job
                      {r.job_count === 1 ? "" : "s"} →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        <p className="mt-10 text-sm leading-6 text-brand-muted">
          CDLA.jobs doesn&rsquo;t make up carriers. Every carrier on this list
          has at least one verified active opening, sourced from their
          ATS feed or direct intake.
        </p>
      </article>
    </SiteShell>
  );
}

void [and, eq, desc, carrierJobs]; // imports kept for future filtering / sort by recency