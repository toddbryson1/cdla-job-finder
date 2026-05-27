import type { MetadataRoute } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, jobPostingCycles } from "@/db/schema";
import { buildJobPostingSlug } from "@/lib/job-slug";
import { listSeedSlugs } from "@/lib/page-data";

// Sitemap for crawlers. Three buckets:
//   1. Static marketing pages (homepage, about, FAQ, partners, etc.)
//   2. /jobs/[region-equipment] aggregate landing pages
//   3. /job/[slug] — one URL per ACTIVE job_posting_cycles row. Each
//      cycle is a 20-day public listing of one (carrier_job, city)
//      pair. Expired cycles are deliberately dropped so Google
//      naturally rotates them out.
//
// We're well under Google's 50k-URL-per-sitemap cap at current scale, so
// this is a single sitemap. If we ever cross ~30k active cycles we'll
// switch to generateSitemaps() and split by source.

const SITE_ORIGIN = "https://cdla.jobs";

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
  const regionEquipmentSlugs = await listSeedSlugs();
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
  // sees a fresh date every repost.
  const cycleRows = await db
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

  return [...staticPages, ...landingPages, ...jobPages];
}
