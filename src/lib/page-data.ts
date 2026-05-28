// /jobs/[region-equipment] landing-page data resolver.
//
// Each landing page renders a few stat-shaped facts about a (region,
// equipment) combo:
//
//   active_partner_count + prospect_count → total_carrier_count
//     "X carriers hiring [equipment] in [region]"
//   pay_low / pay_high / pay_median (10th/90th/50th percentile of
//     pay_range_max_weekly_usd) → the Pay section's $X-$Y / $Z median
//   driver_count_in_region → social-proof when ≥50
//   recent_hire_count → social-proof when > 0
//
// All values come from real queries against carriers + carrier_jobs.
// When a value can't be computed honestly (no carriers in this region,
// or no pay data) we return null/0 and the component falls back to
// the Section-14 "we're growing here" copy from the landing-page spec.
//
// Region semantics in @/lib/region-geo:
//   - metros (atlanta, phoenix, dallas, etc.): jobs within RADIUS_MILES
//     of the metro center
//   - states (texas, georgia, etc.): jobs with domicile_state = code
//   - multi-state regions (southeast, midwest, etc.): jobs in any of
//     the group's states
//   - lanes (i95-corridor, midwest-to-southeast): approximated as
//     multi-state until we model route corridors

import { and, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { ParsedSlug } from "@/lib/slugs";
import {
  carrierJobsInRegionSql,
  driverProxyStates,
  resolveRegionGeo,
} from "@/lib/region-geo";

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

const EMPTY: PageData = {
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

// Minimum row count before we'll publish a pay percentile. With 1 or 2
// jobs the "10th/90th percentile" is meaningless. Below this threshold
// we return null so the Pay section gets skipped and the page falls
// back to the Section-14 low-data copy.
const PAY_MIN_SAMPLE_SIZE = 3;

export async function resolvePageData(parsed: ParsedSlug): Promise<PageData> {
  const geo = resolveRegionGeo(parsed.region);
  if (!geo) return EMPTY;

  const regionPredicate = carrierJobsInRegionSql(geo);
  const equipment = parsed.equipment;

  // Carrier counts — distinct carriers with at least one active job
  // matching the region + equipment. We split by kind to drive the
  // "partner vs prospect" trust-signal copy.
  const carrierRows = (await db.execute(sql`
    SELECT
      c.kind,
      COUNT(DISTINCT c.id)::int AS n
    FROM carriers c
    JOIN carrier_jobs j ON j.carrier_id = c.id
    WHERE c.status = 'active'
      AND j.status = 'active'
      AND j.equipment = ${equipment}
      AND ${regionPredicate}
    GROUP BY c.kind
  `)) as unknown as Array<{ kind: string; n: number }>;

  let activePartnerCount = 0;
  let prospectCount = 0;
  for (const r of carrierRows) {
    // 'partner' + 'subscription' both count as "active partners" for
    // landing-page purposes — both have a paid relationship and post
    // verified rules. 'prospect' is the unsigned-but-known bucket.
    if (r.kind === "partner" || r.kind === "subscription") {
      activePartnerCount += r.n;
    } else if (r.kind === "prospect") {
      prospectCount += r.n;
    }
  }
  const totalCarrierCount = activePartnerCount + prospectCount;

  // Pay percentiles — only when we have ≥PAY_MIN_SAMPLE_SIZE jobs with
  // non-null pay. percentile_cont(0.10) / 0.50 / 0.90 trims the worst
  // outliers (one $3k/wk team job won't blow up the high mark).
  const payRows = (await db.execute(sql`
    SELECT
      COUNT(*)::int AS n,
      percentile_cont(0.10) WITHIN GROUP (ORDER BY pay_range_max_weekly_usd)::int AS pay_low,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY pay_range_max_weekly_usd)::int AS pay_median,
      percentile_cont(0.90) WITHIN GROUP (ORDER BY pay_range_max_weekly_usd)::int AS pay_high
    FROM carrier_jobs
    WHERE status = 'active'
      AND equipment = ${equipment}
      AND pay_range_max_weekly_usd IS NOT NULL
      AND ${regionPredicate}
  `)) as unknown as Array<{
    n: number;
    pay_low: number | null;
    pay_median: number | null;
    pay_high: number | null;
  }>;
  const payRow = payRows[0];
  const haveEnoughPay = payRow && payRow.n >= PAY_MIN_SAMPLE_SIZE;
  const payLow = haveEnoughPay ? payRow.pay_low : null;
  const payHigh = haveEnoughPay ? payRow.pay_high : null;
  const payMedian = haveEnoughPay ? payRow.pay_median : null;

  // Most common accepted_home_time across matching jobs. UNNEST flattens
  // the array column, mode picks the most-frequent value.
  const homeTimeRows = (await db.execute(sql`
    SELECT mode() WITHIN GROUP (ORDER BY ht) AS top_home_time
    FROM (
      SELECT UNNEST(j.accepted_home_time_types) AS ht
      FROM carrier_jobs j
      WHERE j.status = 'active'
        AND j.equipment = ${equipment}
        AND ${regionPredicate}
    ) t
  `)) as unknown as Array<{ top_home_time: string | null }>;
  const mostCommonHomeTime = homeTimeRows[0]?.top_home_time ?? null;

  // Driver count in region — proxy via drivers.cdl_state. Intake doesn't
  // collect a home address (yet), so we use the issuing state.
  const driverStates = driverProxyStates(geo);
  const driverStatesLiteral =
    driverStates.length === 0
      ? "{}"
      : `{${driverStates.map((s) => `"${s}"`).join(",")}}`;
  const driverRows = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM drivers
    WHERE cdl_state = ANY(${driverStatesLiteral}::text[])
  `)) as unknown as Array<{ n: number }>;
  const driverCountInRegion = driverRows[0]?.n ?? 0;

  // Recent hires — placeholder until we add hire tracking. Today we
  // track Stage 2 consent (driver_carrier_applications) but not actual
  // hires, so we conservatively return 0 and the trust-signal card hides.
  const recentHireCount = 0;

  // avgMatchCount — landing template lists this as a possible stat. We
  // could compute it but the existing component doesn't render it. Keep
  // null to make it clear we don't publish it.
  const avgMatchCount = null;

  return {
    activePartnerCount,
    prospectCount,
    totalCarrierCount,
    payLow,
    payHigh,
    payMedian,
    mostCommonHomeTime,
    driverCountInRegion,
    avgMatchCount,
    recentHireCount,
  };
}

/**
 * Slugs we prerender at build time. Returns (region, equipment) combos
 * where at least MIN_JOBS_FOR_PRERENDER jobs exist — so the prerendered
 * pages always show real numbers, not the low-data fallback.
 *
 * Combos with sparse data still resolve at request time (Next.js falls
 * back to runtime rendering for params we don't return here, and ISR
 * caches them with the 15-min revalidate).
 */
export async function listSeedSlugs(): Promise<string[]> {
  const MIN_JOBS_FOR_PRERENDER = 3;

  // For each (region, equipment) combo with our region map, count
  // matching jobs and keep those above the threshold. This runs against
  // a small static set (16 regions × ~15 equipment slugs) so an explicit
  // loop is fine — under 250 cheap queries even in the worst case.
  const out: string[] = [];
  const { REGIONS, EQUIPMENT } = await import("@/lib/slugs");

  for (const regionSlug of Object.keys(REGIONS)) {
    const geo = resolveRegionGeo(regionSlug);
    if (!geo) continue;
    const predicate = carrierJobsInRegionSql(geo);
    for (const equipment of Object.keys(EQUIPMENT)) {
      const rows = (await db.execute(sql`
        SELECT COUNT(*)::int AS n
        FROM carrier_jobs
        WHERE status='active'
          AND equipment=${equipment}
          AND ${predicate}
      `)) as unknown as Array<{ n: number }>;
      if ((rows[0]?.n ?? 0) >= MIN_JOBS_FOR_PRERENDER) {
        out.push(`${regionSlug}-${equipment}`);
      }
    }
  }

  // Always keep the original five fallback slugs so we don't drop any
  // URL Google has already crawled. They'll just render the low-data
  // variant if data is thin.
  for (const slug of [
    "atlanta-reefer",
    "dallas-flatbed",
    "houston-tanker",
    "chicago-dry-van",
    "southeast-otr",
  ]) {
    if (!out.includes(slug)) out.push(slug);
  }

  return out;
}

void and; // silence unused import warning until we add multi-condition queries
