import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildJobSlug, parseJobSlug } from "@/lib/slugs";
import { listSeedSlugs, resolvePageData, type PageData } from "@/lib/page-data";
import { JobsLandingPage } from "@/components/JobsLandingPage";

export const revalidate = 900; // 15 minutes — per template doc section 17

export async function generateStaticParams() {
  const slugs = await listSeedSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const parsed = parseJobSlug(slug);
  if (!parsed) return {};
  const data = await resolvePageData(parsed);

  const title = `${parsed.equipmentInfo.displayName} Jobs in ${parsed.regionInfo.displayName}`;
  const carrierCount =
    data.activePartnerCount + data.prospectCount >= 3
      ? `${data.activePartnerCount + data.prospectCount}+ carriers hiring. `
      : "";
  const description = `Find ${parsed.equipmentInfo.humanized} job in ${parsed.regionInfo.displayName}. ${carrierCount}Match in 6 minutes. Free for drivers.`;

  const canonical = `/jobs/${buildJobSlug(parsed.region, parsed.equipment)}`;

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

export default async function Page(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const parsed = parseJobSlug(slug);
  if (!parsed) notFound();

  const data: PageData = await resolvePageData(parsed);
  return <JobsLandingPage parsed={parsed} data={data} />;
}
