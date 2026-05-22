import type { ParsedSlug } from "@/lib/slugs";

export interface PageData {
  activePartnerCount: number;
  prospectCount: number;
  totalCarrierCount: number;
  payLow: number | null;
  payHigh: number | null;
  payMedian: number | null;
  mostCommonHomeTime: string | null;
  driverCountInRegion: number;
  avgMatchCount: number | null;
  recentHireCount: number;
}

// TODO(landing-pages-v2): migrate to geospatial metro-based model.
// The v1 page-data resolver queried `carrier_hiring_rules` by region+equipment.
// That table is gone (replaced by `carrier_jobs` with lat/lng + radius). Until
// the landing-page rewrite lands, return zeros/nulls so the route renders the
// Section-14 null-fallback copy without crashing.
export async function resolvePageData(_parsed: ParsedSlug): Promise<PageData> {
  return {
    activePartnerCount: 0,
    prospectCount: 0,
    totalCarrierCount: 0,
    payLow: null,
    payHigh: null,
    payMedian: null,
    mostCommonHomeTime: null,
    driverCountInRegion: 0,
    avgMatchCount: null,
    recentHireCount: 0,
  };
}

// TODO(landing-pages-v2): migrate to geospatial metro-based model. The v1
// resolver derived prerender slugs from distinct (region, equipment) pairs in
// `carrier_hiring_rules`. With that table dropped, fall back to a fixed list.
export async function listSeedSlugs(): Promise<string[]> {
  return FALLBACK_SLUGS;
}

const FALLBACK_SLUGS = [
  "atlanta-reefer",
  "dallas-flatbed",
  "houston-tanker",
  "chicago-dry-van",
  "southeast-otr",
];
