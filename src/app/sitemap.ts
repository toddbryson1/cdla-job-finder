import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { articles, carrierJobs, carriers, jobPostingCycles } from "@/db/schema";
import { buildJobPostingSlug } from "@/lib/job-slug";
import { buildCarrierSlug } from "@/lib/carrier-slug";
import { listSeedSlugs } from "@/lib/page-data";

// Sitemap for crawlers. Four buckets:
//   1. Static marketing pages (homepage, about, FAQ, partners, etc.)
//   2. /jobs/[region-equipment] aggregate landing pages
//   3. /job/[slug] — one URL per ACTIVE job_posting_cycles row. Each
//      cycle is a 20-day public listing of one (carrier_job, city)
//      pair. Expired cycles are deliberately dropped so Google
//      naturally rotates them out.
//   4. /articles/[slug] — one URL per published content-machine
//      article (status='published'). Articles don't expire.
//
// We're well under Google's 50k-URL-per-sitemap cap at current scale, so
// this is a single sitemap. If we ever cross ~30k active cycles we'll
// switch to generateSitemaps() and split by source.

const SITE_ORIGIN = "https://www.cdla.jobs";

export const revalidate = 900; // Re-crawl the sitemap every 15 min so new
// jobs show up to Google quickly. Same cadence as the job pages
// themselves, so a fresh sitemap entry is guaranteed to resolve to a
// ready page.

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  // 1. Static pages — order by importance, not by depth.
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_ORIGIN}/`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_ORIGIN}/intake`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${SITE_ORIGIN}/carriers`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE_ORIGIN}/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_ORIGIN}/faq`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_ORIGIN}/partners`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_ORIGIN}/partners/integration`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_ORIGIN}/partners/exclusivity`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_ORIGIN}/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_ORIGIN}/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];

  // 2. /jobs/[region-equipment] aggregate landing pages.
  // listSeedSlugs queries carrier_jobs and may throw if DB transiently
  // unavailable or table missing during a deploy window — fall back
  // to the static fallback slugs in that case so we still publish a
  // sitemap with the marketing pages even if data tier is down.
  let regionEquipmentSlugs: string[];
  try {
    regionEquipmentSlugs = await listSeedSlugs();
  } catch (err) {
    console.warn(
      `[sitemap] listSeedSlugs fallback — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
    regionEquipmentSlugs = [
      "atlanta-reefer",
      "dallas-flatbed",
      "houston-tanker",
      "chicago-dry-van",
      "southeast-otr",
    ];
  }
  const landingPages: MetadataRoute.Sitemap = regionEquipmentSlugs.map(
    (slug) => ({
      url: `${SITE_ORIGIN}/jobs/${slug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }),
  );

  // 3. /job/[slug] — one per ACTIVE posting cycle. Each cycle is its
  // own URL (different cities for the same job get different URLs).
  // We also use the cycle's postedAt as the lastModified so Google
  // sees a fresh date every repost. Same try/catch resilience as #2.
  type CycleRow = {
    cycleId: string;
    city: string;
    state: string;
    postedAt: Date;
    isPrimary: boolean;
    positionTitle: string;
    carrierName: string;
  };
  let cycleRows: CycleRow[] = [];
  try {
    cycleRows = await db
      .select({
        cycleId: jobPostingCycles.id,
        city: jobPostingCycles.city,
        state: jobPostingCycles.state,
        postedAt: jobPostingCycles.postedAt,
        isPrimary: jobPostingCycles.isPrimary,
        positionTitle: carrierJobs.positionTitle,
        carrierName: carriers.name,
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
      .limit(45_000); // hard cap below Google's 50k-per-sitemap limit
  } catch (err) {
    console.warn(
      `[sitemap] cycle URL list skipped — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const jobPages: MetadataRoute.Sitemap = cycleRows.map((r) => ({
    url: `${SITE_ORIGIN}/job/${buildJobPostingSlug(
      { name: r.carrierName },
      {
        id: r.cycleId,
        positionTitle: r.positionTitle,
        domicileCity: r.city,
        domicileState: r.state,
      },
    )}`,
    lastModified: r.postedAt,
    changeFrequency: "weekly",
    // Primary cycles get a slightly higher priority — these are the
    // canonical postings; secondaries are SEO reach.
    priority: r.isPrimary ? 0.9 : 0.7,
  }));

  // 4. /articles/[slug] — published content-machine articles. Same
  // try/catch resilience as #2 and #3 so a DB hiccup doesn't blank
  // the sitemap.
  type ArticleRow = { slug: string; publishedAt: Date | null };
  let articleRows: ArticleRow[] = [];
  try {
    articleRows = await db
      .select({
        slug: articles.slug,
        publishedAt: articles.publishedAt,
      })
      .from(articles)
      .where(eq(articles.status, "published"));
  } catch (err) {
    console.warn(
      `[sitemap] article URL list skipped — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const articlePages: MetadataRoute.Sitemap = articleRows.map((r) => ({
    url: `${SITE_ORIGIN}/articles/${r.slug}`,
    lastModified: r.publishedAt ?? now,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  // 5. /carriers/[slug] — one profile page per active carrier
  // (excluding composite seed rows). Same try/catch resilience.
  type CarrierRow = { name: string };
  let carrierRows: CarrierRow[] = [];
  try {
    carrierRows = await db
      .select({ name: carriers.name })
      .from(carriers)
      .where(eq(carriers.status, "active"));
  } catch (err) {
    console.warn(
      `[sitemap] carrier URL list skipped — DB query failed (${err instanceof Error ? err.message : String(err)})`,
    );
  }
  const carrierPages: MetadataRoute.Sitemap = carrierRows
    .filter((r) => !/composite/i.test(r.name))
    .map((r) => ({
      url: `${SITE_ORIGIN}/carriers/${buildCarrierSlug(r)}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    }));

  return [
    ...staticPages,
    ...landingPages,
    ...jobPages,
    ...articlePages,
    ...carrierPages,
  ];
}
