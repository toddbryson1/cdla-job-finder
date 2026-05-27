import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers } from "@/db/schema";
import { buildJobPostingSlug } from "@/lib/job-slug";
import { listSeedSlugs } from "@/lib/page-data";

// Sitemap for crawlers. Three buckets:
//   1. Static marketing pages (homepage, about, FAQ, partners, etc.)
//   2. /jobs/[region-equipment] aggregate landing pages
//   3. /job/[slug] — one URL per active carrier_jobs row (Google for Jobs
//      pulls JobPosting JSON-LD from these and syndicates them)
//
// We're well under Google's 50k-URL-per-sitemap cap at current scale, so
// this is a single sitemap. If we ever cross ~30k jobs we'll switch to
// generateSitemaps() and split by source.

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

  // 3. /job/[slug] — one per active job. lastModified pulls from
  // updatedAt so Google notices when we re-verify a listing.
  const jobRows = await db
    .select({
      id: carrierJobs.id,
      positionTitle: carrierJobs.positionTitle,
      domicileCity: carrierJobs.domicileCity,
      domicileState: carrierJobs.domicileState,
      updatedAt: carrierJobs.updatedAt,
      lastVerifiedAt: carrierJobs.lastVerifiedAt,
      carrierName: carriers.name,
    })
    .from(carrierJobs)
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(eq(carrierJobs.status, "active"))
    .limit(45_000); // hard cap below Google's 50k-per-sitemap limit

  const jobPages: MetadataRoute.Sitemap = jobRows.map((r) => ({
    url: `${SITE_ORIGIN}/job/${buildJobPostingSlug(
      { name: r.carrierName },
      {
        id: r.id,
        positionTitle: r.positionTitle,
        domicileCity: r.domicileCity,
        domicileState: r.domicileState,
      },
    )}`,
    lastModified: r.lastVerifiedAt ?? r.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...landingPages, ...jobPages];
}
