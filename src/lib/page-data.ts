import { and, count, eq, inArray, max, min, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierHiringRules, carriers, drivers } from "@/db/schema";
import { EQUIPMENT, REGIONS, type ParsedSlug } from "@/lib/slugs";
import { statesForRegion } from "@/lib/region-states";

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

/**
 * Resolves the variables defined in docs/CDLAjobs_Driver_Landing_Page_Template.docx
 * Section 2.4 against the database. Counts, ranges, and modes are computed
 * live; fallbacks (Section 14) are handled in the component.
 *
 * Notes on proxies (until more data is captured):
 *   - `driver_count_in_region` uses `cdl_state` as the proxy for `address_state`.
 *   - `avg_match_count` / `recent_hire_count` are currently 0 until a matching
 *     engine and hire tracking are built.
 */
export async function resolvePageData(parsed: ParsedSlug): Promise<PageData> {
  const { region, equipment } = parsed;

  const [partnerRow, prospectRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(carrierHiringRules)
      .innerJoin(carriers, eq(carriers.id, carrierHiringRules.carrierId))
      .where(
        and(
          eq(carrierHiringRules.region, region),
          eq(carrierHiringRules.equipment, equipment),
          eq(carriers.kind, "partner"),
        ),
      ),
    db
      .select({ n: count() })
      .from(carrierHiringRules)
      .innerJoin(carriers, eq(carriers.id, carrierHiringRules.carrierId))
      .where(
        and(
          eq(carrierHiringRules.region, region),
          eq(carrierHiringRules.equipment, equipment),
          eq(carriers.kind, "prospect"),
        ),
      ),
  ]);

  const activePartnerCount = partnerRow[0]?.n ?? 0;
  const prospectCount = prospectRow[0]?.n ?? 0;

  const payRow = await db
    .select({
      lo: min(carrierHiringRules.payMinWeekly),
      hi: max(carrierHiringRules.payMaxWeekly),
      median: sql<number>`percentile_cont(0.5) within group (order by (${carrierHiringRules.payMinWeekly} + ${carrierHiringRules.payMaxWeekly}) / 2.0)`,
    })
    .from(carrierHiringRules)
    .where(
      and(
        eq(carrierHiringRules.region, region),
        eq(carrierHiringRules.equipment, equipment),
      ),
    );

  const payLowRaw = payRow[0]?.lo;
  const payHighRaw = payRow[0]?.hi;
  const payMedianRaw = payRow[0]?.median;

  const payLow = payLowRaw == null ? null : Number(payLowRaw);
  const payHigh = payHighRaw == null ? null : Number(payHighRaw);
  const payMedian = payMedianRaw == null ? null : Math.round(Number(payMedianRaw));

  const homeTimeRow = await db
    .select({
      ht: carrierHiringRules.homeTime,
      n: count(),
    })
    .from(carrierHiringRules)
    .where(
      and(
        eq(carrierHiringRules.region, region),
        eq(carrierHiringRules.equipment, equipment),
        sql`${carrierHiringRules.homeTime} is not null`,
      ),
    )
    .groupBy(carrierHiringRules.homeTime)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  const mostCommonHomeTime = homeTimeRow[0]?.ht ?? null;

  const states = statesForRegion(region);
  let driverCountInRegion = 0;
  if (states.length > 0) {
    const driverRow = await db
      .select({ n: count() })
      .from(drivers)
      .where(inArray(drivers.cdlState, states));
    driverCountInRegion = driverRow[0]?.n ?? 0;
  }

  return {
    activePartnerCount,
    prospectCount,
    totalCarrierCount: activePartnerCount + prospectCount,
    payLow,
    payHigh,
    payMedian,
    mostCommonHomeTime,
    driverCountInRegion,
    avgMatchCount: null,
    recentHireCount: 0,
  };
}

/**
 * Used by `generateStaticParams` to prerender canonical pages at build time.
 * Returns combos that have at least one carrier hiring rule in the DB.
 * Falls back to a small fixed list if the DB is empty (e.g. on fresh checkout).
 */
export async function listSeedSlugs(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({
        region: carrierHiringRules.region,
        equipment: carrierHiringRules.equipment,
      })
      .from(carrierHiringRules);

    const valid = rows
      .filter((r) => REGIONS[r.region] && EQUIPMENT[r.equipment])
      .map((r) => `${r.region}-${r.equipment}`);

    if (valid.length > 0) return valid;
  } catch {
    // DB unavailable at build time — fall through to defaults.
  }

  return FALLBACK_SLUGS;
}

const FALLBACK_SLUGS = [
  "atlanta-reefer",
  "dallas-flatbed",
  "houston-tanker",
  "chicago-dry-van",
  "southeast-otr",
];
