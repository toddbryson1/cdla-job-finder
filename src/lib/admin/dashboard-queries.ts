// Queries powering the /admin dashboard. Read-only.
//
// Each function returns a small, focused shape. The view composes
// them; tests verify each in isolation against the seed DB.

import { sql } from "drizzle-orm";
import { db } from "@/db/client";

export interface DashboardCounts {
  carriers: { active: number; partner: number; subscription: number; prospect: number };
  carrierJobs: { active: number; archived: number };
  postingCycles: { active: number; expired: number; primary: number };
}

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const carrierRows = (await db.execute(sql`
    SELECT kind, COUNT(*)::int AS n
    FROM carriers
    WHERE status='active'
    GROUP BY kind
  `)) as unknown as Array<{ kind: string; n: number }>;

  const carriers = { active: 0, partner: 0, subscription: 0, prospect: 0 };
  for (const r of carrierRows) {
    carriers.active += r.n;
    if (r.kind === "partner") carriers.partner = r.n;
    else if (r.kind === "subscription") carriers.subscription = r.n;
    else if (r.kind === "prospect") carriers.prospect = r.n;
  }

  const jobRows = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS n
    FROM carrier_jobs
    GROUP BY status
  `)) as unknown as Array<{ status: string; n: number }>;
  const carrierJobs = { active: 0, archived: 0 };
  for (const r of jobRows) {
    if (r.status === "active") carrierJobs.active = r.n;
    else if (r.status === "archived") carrierJobs.archived = r.n;
  }

  const cycleRows = (await db.execute(sql`
    SELECT status, COUNT(*)::int AS n,
           (COUNT(*) FILTER (WHERE is_primary))::int AS primary_n
    FROM job_posting_cycles
    GROUP BY status
  `)) as unknown as Array<{ status: string; n: number; primary_n: number }>;
  const postingCycles = { active: 0, expired: 0, primary: 0 };
  for (const r of cycleRows) {
    if (r.status === "active") {
      postingCycles.active = r.n;
      postingCycles.primary = r.primary_n;
    } else if (r.status === "expired") postingCycles.expired = r.n;
  }

  return { carriers, carrierJobs, postingCycles };
}

export interface CarrierBreakdownRow {
  name: string;
  kind: string;
  active_jobs: number;
  active_cycles: number;
  by_quality: { complete: number; partial: number; minimal: number };
}

export async function getCarrierBreakdown(): Promise<CarrierBreakdownRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.name,
      c.kind::text AS kind,
      COUNT(DISTINCT j.id)::int AS active_jobs,
      (COUNT(DISTINCT cy.id) FILTER (WHERE cy.status = 'active'))::int AS active_cycles,
      (COUNT(DISTINCT j.id) FILTER (WHERE j.data_quality = 'complete'))::int AS complete_n,
      (COUNT(DISTINCT j.id) FILTER (WHERE j.data_quality = 'partial'))::int AS partial_n,
      (COUNT(DISTINCT j.id) FILTER (WHERE j.data_quality = 'minimal'))::int AS minimal_n
    FROM carriers c
    LEFT JOIN carrier_jobs j ON j.carrier_id = c.id AND j.status = 'active'
    LEFT JOIN job_posting_cycles cy ON cy.job_id = j.id
    WHERE c.status = 'active'
    GROUP BY c.name, c.kind
    ORDER BY active_jobs DESC, c.name ASC
  `)) as unknown as Array<{
    name: string;
    kind: string;
    active_jobs: number;
    active_cycles: number;
    complete_n: number;
    partial_n: number;
    minimal_n: number;
  }>;
  return rows.map((r) => ({
    name: r.name,
    kind: r.kind,
    active_jobs: r.active_jobs,
    active_cycles: r.active_cycles,
    by_quality: {
      complete: r.complete_n,
      partial: r.partial_n,
      minimal: r.minimal_n,
    },
  }));
}

export interface RecentActivityRow {
  bucket: string;
  count: number;
}

export async function getRecentActivity(): Promise<RecentActivityRow[]> {
  // Counts of various write activities in the last 24h
  const rows = (await db.execute(sql`
    SELECT 'carrier_jobs inserted' AS bucket, COUNT(*)::int AS count
      FROM carrier_jobs WHERE created_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'carrier_jobs updated', COUNT(*)::int
      FROM carrier_jobs
      WHERE updated_at >= NOW() - INTERVAL '24 hours'
        AND updated_at > created_at + INTERVAL '1 minute'
    UNION ALL
    SELECT 'carrier_jobs archived', COUNT(*)::int
      FROM carrier_jobs
      WHERE status = 'archived' AND updated_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'cycles spawned', COUNT(*)::int
      FROM job_posting_cycles WHERE posted_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'cycles expired', COUNT(*)::int
      FROM job_posting_cycles
      WHERE status = 'expired' AND expires_at >= NOW() - INTERVAL '24 hours'
    UNION ALL
    SELECT 'drivers signed up', COUNT(*)::int
      FROM drivers WHERE created_at >= NOW() - INTERVAL '24 hours'
  `)) as unknown as RecentActivityRow[];
  return rows;
}

export interface CyclesExpiringRow {
  carrier: string;
  position_title: string;
  city: string;
  state: string;
  expires_at: Date;
  days_left: number;
}

export async function getCyclesExpiringSoon(days = 5): Promise<CyclesExpiringRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.name AS carrier,
      j.position_title,
      cy.city,
      cy.state,
      cy.expires_at,
      EXTRACT(EPOCH FROM (cy.expires_at - NOW())) / 86400 AS days_left
    FROM job_posting_cycles cy
    JOIN carrier_jobs j ON j.id = cy.job_id
    JOIN carriers c ON c.id = j.carrier_id
    WHERE cy.status = 'active'
      AND cy.expires_at BETWEEN NOW() AND NOW() + (${days} || ' days')::INTERVAL
    ORDER BY cy.expires_at ASC
    LIMIT 50
  `)) as unknown as Array<{
    carrier: string;
    position_title: string;
    city: string;
    state: string;
    expires_at: Date;
    days_left: number;
  }>;
  return rows.map((r) => ({
    ...r,
    days_left: Math.round(Number(r.days_left)),
  }));
}

export interface TaUnresolvedRow {
  division: string;
  city: string | null;
  state: string | null;
  has_mapping: boolean;
  data_quality: string;
}

/**
 * TA jobs currently at minimal quality with no detail-tab mapping
 * confirmed — the human-review queue for /admin → TA review.
 */
export async function getTaUnresolved(): Promise<TaUnresolvedRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      j.position_title AS division,
      j.domicile_city AS city,
      j.domicile_state AS state,
      EXISTS (
        SELECT 1 FROM ta_opening_tab_mappings m
        WHERE m.opening_division_raw = j.position_title
           OR j.position_title ILIKE '%' || m.opening_division_raw || '%'
      ) AS has_mapping,
      j.data_quality::text AS data_quality
    FROM carrier_jobs j
    JOIN carriers c ON c.id = j.carrier_id
    WHERE c.name = 'Transport America'
      AND j.status = 'active'
    ORDER BY j.data_quality, j.position_title
  `)) as unknown as TaUnresolvedRow[];
  return rows;
}

export interface RecentArchivedRow {
  carrier: string;
  position_title: string;
  city: string;
  state: string;
  archived_at: Date;
}

export async function getRecentArchivedJobs(limit = 20): Promise<RecentArchivedRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.name AS carrier,
      j.position_title,
      j.domicile_city AS city,
      j.domicile_state AS state,
      j.updated_at AS archived_at
    FROM carrier_jobs j
    JOIN carriers c ON c.id = j.carrier_id
    WHERE j.status = 'archived'
    ORDER BY j.updated_at DESC
    LIMIT ${limit}
  `)) as unknown as RecentArchivedRow[];
  return rows;
}

export interface DriverFunnel30d {
  intakes: number;
  intakesWithAnyMatch: number;
  intakesWithAnyConsent: number;
  totalImpressions: number;
  totalConsents: number;
  totalQualified: number;
  matchCountBuckets: { zero: number; one: number; twoToFour: number; fivePlus: number };
}

/**
 * Driver-side conversion funnel for the last 30 days. Intakes → had at
 * least one match shown → consented to share with at least one carrier.
 * Plus the distribution of match counts so we can see if drivers are
 * mostly getting 0/1 matches (carrier-supply problem) vs 5+ (good).
 */
export async function getDriverFunnel30d(): Promise<DriverFunnel30d> {
  const [main] = (await db.execute(sql`
    WITH recent_drivers AS (
      SELECT id FROM drivers
      WHERE created_at >= NOW() - INTERVAL '30 days'
    ),
    match_counts AS (
      SELECT d.id AS driver_id, COUNT(m.id)::int AS n_matches
      FROM recent_drivers d
      LEFT JOIN driver_carrier_matches m ON m.driver_id = d.id
      GROUP BY d.id
    ),
    consent_counts AS (
      SELECT d.id AS driver_id, COUNT(a.id)::int AS n_consents
      FROM recent_drivers d
      LEFT JOIN driver_carrier_applications a ON a.driver_id = d.id
      GROUP BY d.id
    )
    SELECT
      (SELECT COUNT(*)::int FROM recent_drivers) AS intakes,
      (SELECT COUNT(*)::int FROM match_counts WHERE n_matches > 0) AS intakes_with_any_match,
      (SELECT COUNT(*)::int FROM consent_counts WHERE n_consents > 0) AS intakes_with_any_consent,
      (SELECT COALESCE(SUM(n_matches), 0)::int FROM match_counts) AS total_impressions,
      (SELECT COALESCE(SUM(n_consents), 0)::int FROM consent_counts) AS total_consents,
      (SELECT COUNT(*)::int FROM driver_carrier_applications a
        JOIN recent_drivers d ON d.id = a.driver_id
        WHERE a.last_qualified = TRUE) AS total_qualified,
      (SELECT COUNT(*)::int FROM match_counts WHERE n_matches = 0) AS bucket_zero,
      (SELECT COUNT(*)::int FROM match_counts WHERE n_matches = 1) AS bucket_one,
      (SELECT COUNT(*)::int FROM match_counts WHERE n_matches BETWEEN 2 AND 4) AS bucket_two_four,
      (SELECT COUNT(*)::int FROM match_counts WHERE n_matches >= 5) AS bucket_five_plus
  `)) as unknown as Array<{
    intakes: number;
    intakes_with_any_match: number;
    intakes_with_any_consent: number;
    total_impressions: number;
    total_consents: number;
    total_qualified: number;
    bucket_zero: number;
    bucket_one: number;
    bucket_two_four: number;
    bucket_five_plus: number;
  }>;

  return {
    intakes: main.intakes,
    intakesWithAnyMatch: main.intakes_with_any_match,
    intakesWithAnyConsent: main.intakes_with_any_consent,
    totalImpressions: main.total_impressions,
    totalConsents: main.total_consents,
    totalQualified: main.total_qualified,
    matchCountBuckets: {
      zero: main.bucket_zero,
      one: main.bucket_one,
      twoToFour: main.bucket_two_four,
      fivePlus: main.bucket_five_plus,
    },
  };
}

export interface CarrierPerformanceRow {
  carrier: string;
  kind: string;
  tier: string;
  impressions: number;
  consents: number;
  qualified: number;
  consent_rate_pct: number; // 0..100, rounded to 1 decimal
}

/**
 * Per-carrier conversion for the last 30 days. Impressions = times the
 * carrier appeared on a /matches page; consents = drivers who picked
 * the carrier to share their info with; qualified = consents where the
 * Stage 2 qualification check passed.
 *
 * Ordered by impressions desc so the carriers in front of the most
 * drivers float to the top.
 */
export async function getCarrierPerformance30d(): Promise<CarrierPerformanceRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.name AS carrier,
      c.kind::text AS kind,
      c.tier::text AS tier,
      COALESCE(imp.n, 0)::int AS impressions,
      COALESCE(con.n, 0)::int AS consents,
      COALESCE(con.qualified_n, 0)::int AS qualified,
      CASE
        WHEN COALESCE(imp.n, 0) = 0 THEN 0
        ELSE ROUND(100.0 * COALESCE(con.n, 0)::numeric / imp.n, 1)
      END AS consent_rate_pct
    FROM carriers c
    LEFT JOIN (
      SELECT carrier_id, COUNT(*)::int AS n
      FROM driver_carrier_matches
      WHERE matched_at >= NOW() - INTERVAL '30 days'
      GROUP BY carrier_id
    ) imp ON imp.carrier_id = c.id
    LEFT JOIN (
      SELECT carrier_id,
             COUNT(*)::int AS n,
             (COUNT(*) FILTER (WHERE last_qualified = TRUE))::int AS qualified_n
      FROM driver_carrier_applications
      WHERE consented_at >= NOW() - INTERVAL '30 days'
      GROUP BY carrier_id
    ) con ON con.carrier_id = c.id
    WHERE c.status = 'active'
      AND (COALESCE(imp.n, 0) > 0 OR COALESCE(con.n, 0) > 0)
    ORDER BY impressions DESC, consents DESC, c.name ASC
  `)) as unknown as Array<{
    carrier: string;
    kind: string;
    tier: string;
    impressions: number;
    consents: number;
    qualified: number;
    consent_rate_pct: string | number;
  }>;
  return rows.map((r) => ({
    ...r,
    consent_rate_pct: Number(r.consent_rate_pct),
  }));
}

export interface PendingCarrierRow {
  id: string;
  name: string;
  homepage_url: string;
  careers_url: string | null;
  status: string;
  discovered_at: Date;
  job_count: number;
  has_pay_data: boolean;
  surface_breakdown: Record<string, number>;
  sample_titles: string[];
}

/**
 * Pending-carrier review queue per
 * SPEC_prospect-carrier-job-ingestion-v1.md §9 Phase 1. Lists carriers
 * the crawler discovered + their staged jobs awaiting human approval.
 *
 * Ordered: pending first (oldest first — review FIFO), then approved,
 * then rejected.
 */
export async function getPendingCarriersReviewQueue(): Promise<PendingCarrierRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      pc.id,
      pc.name,
      pc.homepage_url,
      pc.careers_url,
      pc.status::text AS status,
      pc.discovered_at,
      COALESCE(j.job_count, 0)::int AS job_count,
      COALESCE(j.has_pay_data, false) AS has_pay_data,
      COALESCE(j.surface_breakdown, '{}'::jsonb) AS surface_breakdown,
      COALESCE(j.sample_titles, ARRAY[]::text[]) AS sample_titles
    FROM pending_carriers pc
    LEFT JOIN (
      SELECT
        pending_carrier_id,
        COUNT(*)::int AS job_count,
        bool_or(pay_max_weekly_usd IS NOT NULL) AS has_pay_data,
        jsonb_object_agg(application_surface, n) AS surface_breakdown,
        (array_agg(title ORDER BY title))[1:3] AS sample_titles
      FROM (
        SELECT pending_carrier_id, application_surface, title, pay_max_weekly_usd,
               COUNT(*) OVER (PARTITION BY pending_carrier_id, application_surface) AS n
        FROM pending_carrier_jobs
      ) inner_jobs
      GROUP BY pending_carrier_id
    ) j ON j.pending_carrier_id = pc.id
    ORDER BY
      CASE pc.status
        WHEN 'pending' THEN 0
        WHEN 'approved' THEN 1
        WHEN 'duplicate' THEN 2
        WHEN 'rejected' THEN 3
      END,
      pc.discovered_at DESC
    LIMIT 50
  `)) as unknown as Array<{
    id: string;
    name: string;
    homepage_url: string;
    careers_url: string | null;
    status: string;
    discovered_at: Date;
    job_count: number;
    has_pay_data: boolean;
    surface_breakdown: Record<string, number> | null;
    sample_titles: string[] | null;
  }>;
  return rows.map((r) => ({
    ...r,
    surface_breakdown: r.surface_breakdown ?? {},
    sample_titles: r.sample_titles ?? [],
  }));
}

export interface RecentConsentRow {
  carrier: string;
  position_title: string;
  driver_first_name: string;
  cdl_state: string;
  consented_at: Date;
  qualified: boolean | null;
}

/**
 * Most recent driver→carrier consents. The actionable inbox: each row
 * is a lead a carrier just got. Useful for spot-checking that consents
 * are flowing and that qualification is running.
 */
export async function getRecentConsents(limit = 20): Promise<RecentConsentRow[]> {
  const rows = (await db.execute(sql`
    SELECT
      c.name AS carrier,
      j.position_title,
      d.first_name AS driver_first_name,
      d.cdl_state,
      a.consented_at,
      a.last_qualified AS qualified
    FROM driver_carrier_applications a
    JOIN carriers c ON c.id = a.carrier_id
    JOIN carrier_jobs j ON j.id = a.job_id
    JOIN drivers d ON d.id = a.driver_id
    ORDER BY a.consented_at DESC
    LIMIT ${limit}
  `)) as unknown as RecentConsentRow[];
  return rows;
}
