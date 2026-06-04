// Queries powering the /admin dashboard. Read-only.
//
// Each function returns a small, focused shape. The view composes
// them; tests verify each in isolation against the seed DB.

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  validateAndersonQuickbaseConfig,
  type AndersonQuickbaseConfigValidation,
} from "@/lib/quickbase/client";

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

export interface FunnelEventStats {
  /** matches_viewed events in the window. */
  matchesViewed: number;
  /** Distinct drivers who hit /matches in the window. */
  uniqueDriversViewed: number;
  /** matches_viewed events where the driver saw ZERO cards — the
   *  hardest dead-end in the funnel. */
  zeroMatchViews: number;
  /** Average match_count across matches_viewed events, 1 decimal. */
  avgMatchCount: number;
  /** Of the distinct drivers who viewed, how many later have at least
   *  one consent on record. The view→consent conversion the
   *  state-only funnel can't isolate to actual page views. */
  viewedThenConsented: number;
  /** consent_submitted events in the window (each is one Stage 2
   *  consent completion, including re-consents to the same carrier). */
  consentEvents: number;
  /** Distinct drivers with at least one consent_submitted event in the
   *  window — the event-log numerator that pairs with
   *  uniqueDriversViewed for a pure view→consent rate. */
  uniqueDriversConsented: number;
  /** Most recent matches_viewed event, or null if none yet. */
  latestViewAt: Date | null;
}

/**
 * Event-log view of the matches funnel for the last `days` days. Reads
 * funnel_events (migration 0033) rather than reconstructing from state
 * tables, so it answers page-view questions: how many drivers actually
 * landed on /matches, how many saw a dead end (0 cards), and how many
 * of the viewers went on to consent.
 *
 * Empty/zero everywhere until matches_viewed events accumulate — the
 * table starts empty on deploy. The admin panel says so explicitly so
 * a fresh zero doesn't read as "the funnel is broken."
 */
export async function getFunnelEventStats(
  days = 30,
): Promise<FunnelEventStats> {
  const [row] = (await db.execute(sql`
    WITH views AS (
      SELECT driver_id, match_count, created_at
      FROM funnel_events
      WHERE event_type = 'matches_viewed'
        AND created_at >= NOW() - (${days} * INTERVAL '1 day')
    ),
    viewer_drivers AS (
      SELECT DISTINCT driver_id FROM views WHERE driver_id IS NOT NULL
    ),
    consents AS (
      SELECT driver_id
      FROM funnel_events
      WHERE event_type = 'consent_submitted'
        AND created_at >= NOW() - (${days} * INTERVAL '1 day')
    )
    SELECT
      (SELECT COUNT(*)::int FROM views) AS matches_viewed,
      (SELECT COUNT(*)::int FROM viewer_drivers) AS unique_drivers_viewed,
      (SELECT COUNT(*)::int FROM views WHERE match_count = 0) AS zero_match_views,
      (SELECT COALESCE(ROUND(AVG(match_count)::numeric, 1), 0) FROM views) AS avg_match_count,
      (SELECT COUNT(*)::int FROM viewer_drivers vd
        WHERE EXISTS (
          SELECT 1 FROM driver_carrier_applications a
          WHERE a.driver_id = vd.driver_id
        )) AS viewed_then_consented,
      (SELECT COUNT(*)::int FROM consents) AS consent_events,
      (SELECT COUNT(DISTINCT driver_id)::int FROM consents WHERE driver_id IS NOT NULL) AS unique_drivers_consented,
      (SELECT MAX(created_at) FROM views) AS latest_view_at
  `)) as unknown as Array<{
    matches_viewed: number;
    unique_drivers_viewed: number;
    zero_match_views: number;
    avg_match_count: string | number;
    viewed_then_consented: number;
    consent_events: number;
    unique_drivers_consented: number;
    latest_view_at: Date | string | null;
  }>;

  return {
    matchesViewed: row.matches_viewed,
    uniqueDriversViewed: row.unique_drivers_viewed,
    zeroMatchViews: row.zero_match_views,
    avgMatchCount: Number(row.avg_match_count),
    viewedThenConsented: row.viewed_then_consented,
    consentEvents: row.consent_events,
    uniqueDriversConsented: row.unique_drivers_consented,
    latestViewAt: row.latest_view_at ? new Date(row.latest_view_at) : null,
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

export interface PartnerHandoffFunnel {
  byStage: Record<
    | "apply_initiated"
    | "stage2_consented"
    | "intelliapp_link_sent"
    | "submitted_to_sterling"
    | "submit_failed_validation"
    | "submit_queued_for_retry"
    | "stalled",
    number
  >;
  /** Total rows ever produced through the handoff (sum across stages). */
  total: number;
  /** Rows currently overdue for a retry sweep (next_retry_at <= now). */
  retryDueNow: number;
  /** Rows with a confirmed QuickBase record ID from Sterling. */
  sterlingConfirmed: number;
  /** Total push attempts across all rows (cost-tracking proxy). */
  totalAttempts: number;
  /** Last sterling-confirmed timestamp; null when none yet. */
  latestSubmissionAt: Date | null;
}

/**
 * Anderson handoff (Sterling QuickBase) funnel. Counts rows in
 * partner_application_stages by their current stage, plus a few
 * derived metrics useful when QB push goes live and ops needs to
 * watch the queue health.
 *
 * Per spec §B7. This dashboard panel is the operational read of
 * what the QB retry sweeper (src/lib/quickbase/retry-sweeper.ts)
 * is doing — anything not draining shows up here first.
 */
export async function getPartnerHandoffFunnel(): Promise<PartnerHandoffFunnel> {
  // Single query — group by stage + aggregate the derived metrics
  // together so the admin dashboard does one round-trip not N.
  const rows = (await db.execute(sql`
    SELECT
      stage,
      count(*)::int AS n,
      sum(quickbase_push_attempts)::int AS total_attempts,
      count(*) FILTER (
        WHERE stage = 'submit_queued_for_retry'
          AND quickbase_next_retry_at IS NOT NULL
          AND quickbase_next_retry_at <= now()
      )::int AS retry_due_now,
      count(*) FILTER (
        WHERE quickbase_record_id IS NOT NULL
      )::int AS sterling_confirmed,
      max(quickbase_push_succeeded_at) AS latest_submission_at
    FROM partner_application_stages
    GROUP BY stage
  `)) as unknown as Array<{
    stage: keyof PartnerHandoffFunnel["byStage"];
    n: number;
    total_attempts: number;
    retry_due_now: number;
    sterling_confirmed: number;
    latest_submission_at: string | Date | null;
  }>;

  const byStage: PartnerHandoffFunnel["byStage"] = {
    apply_initiated: 0,
    stage2_consented: 0,
    intelliapp_link_sent: 0,
    submitted_to_sterling: 0,
    submit_failed_validation: 0,
    submit_queued_for_retry: 0,
    stalled: 0,
  };
  let total = 0;
  let retryDueNow = 0;
  let sterlingConfirmed = 0;
  let totalAttempts = 0;
  let latestSubmissionAt: Date | null = null;

  for (const r of rows) {
    if (r.stage in byStage) byStage[r.stage] = r.n;
    total += r.n;
    retryDueNow += r.retry_due_now;
    sterlingConfirmed += r.sterling_confirmed;
    totalAttempts += r.total_attempts;
    if (r.latest_submission_at) {
      const d = new Date(r.latest_submission_at);
      if (!latestSubmissionAt || d > latestSubmissionAt) latestSubmissionAt = d;
    }
  }

  return {
    byStage,
    total,
    retryDueNow,
    sterlingConfirmed,
    totalAttempts,
    latestSubmissionAt,
  };
}

export interface CarrierHandoffDriftRow {
  carrierId: string;
  carrierName: string;
  /** Stable code, in lock-step with the codes the retry sweeper
   *  writes to quickbase_last_error. The drift card uses these to
   *  group identical failure modes together. */
  code: Exclude<AndersonQuickbaseConfigValidation, { ok: true }>["code"];
  /** Plain-English explanation of why this carrier's config no
   *  longer validates as anderson_quickbase. */
  reason: string;
  /** Non-terminal stage rows that will fail when the retry sweeper
   *  next fires for this carrier. The actionable count. */
  pendingRows: number;
  /** Stage rows already terminated with a drift-shaped error. The
   *  historical evidence — useful when triaging a freshly-noticed
   *  drift to see how long it's been bleeding. */
  historicalDriftRows: number;
  /** Best-effort extraction of whatever quickbase fields are present
   *  in the (drifted) config today, so the admin inline editor can
   *  pre-fill rather than start blank. Empty strings where a field is
   *  absent or non-string — the config is drifted, so any subset may
   *  be missing. */
  currentConfig: HandoffConfigPrefill;
}

export interface HandoffConfigPrefill {
  realmHostname: string;
  appId: string;
  tableId: string;
  defaultRecruiterName: string;
}

/**
 * Pull the quickbase fields out of a (possibly malformed) handoff
 * config for editor pre-fill. Never throws — coerces anything
 * non-string to "" so the form always renders.
 */
function extractHandoffPrefill(cfg: unknown): HandoffConfigPrefill {
  const obj = (cfg && typeof cfg === "object" ? cfg : {}) as Record<
    string,
    unknown
  >;
  const qb = (obj.quickbase && typeof obj.quickbase === "object"
    ? obj.quickbase
    : {}) as Record<string, unknown>;
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  return {
    realmHostname: str(qb.realm_hostname),
    appId: str(qb.app_id),
    tableId: str(qb.table_id),
    defaultRecruiterName: str(qb.default_recruiter_name),
  };
}

export interface CarrierHandoffDrift {
  /** One entry per drifted carrier. Empty when everything is well-
   *  configured (the happy path — most days). */
  drifted: CarrierHandoffDriftRow[];
  /** Sum of pendingRows across all drifted carriers. The "if I do
   *  nothing, this many drivers fail on the next sweep" number. */
  totalPendingDoomed: number;
  /** Sum of historicalDriftRows. The "how much has already silently
   *  failed" number. */
  totalHistoricalDriftRows: number;
}

/**
 * Find carriers whose partner_handoff_config no longer validates as
 * a usable anderson_quickbase config — but who either declare that
 * handoff_type today OR have at least one partner_application_stages
 * row pointing at them. Those are the "doomed handoff" carriers: the
 * retry sweeper will flip every pending row to submit_failed_validation
 * the next time it fires.
 *
 * This complements getPartnerHandoffFunnel — the funnel shows the
 * current stage distribution, this shows the underlying carrier-config
 * health so an operator can act BEFORE the sweep produces failures.
 *
 * Stays in code (not SQL): the validator predicate is shared with the
 * sweeper and the inline handler, so anything that changes about
 * "what counts as valid" lives in one place
 * (src/lib/quickbase/client.ts:validateAndersonQuickbaseConfig).
 */
export async function getCarrierHandoffDrift(): Promise<CarrierHandoffDrift> {
  // Two-table scan, joined in code: cheaper than the equivalent
  // jsonb-shape SQL and easier to keep aligned with the validator.
  // Partner population is small (~6 carriers in prod today), so an
  // unbounded scan is fine.
  const candidates = (await db.execute(sql`
    SELECT
      c.id::text AS carrier_id,
      c.name AS carrier_name,
      c.partner_handoff_config AS cfg,
      COALESCE(
        (SELECT count(*) FROM partner_application_stages s
          WHERE s.carrier_id = c.id
            AND s.stage IN (
              'apply_initiated',
              'stage2_consented',
              'intelliapp_link_sent',
              'submit_queued_for_retry'
            ))::int,
        0
      ) AS pending_rows,
      COALESCE(
        (SELECT count(*) FROM partner_application_stages s
          WHERE s.carrier_id = c.id
            AND s.stage = 'submit_failed_validation'
            AND s.quickbase_last_error IS NOT NULL
            AND (
              s.quickbase_last_error LIKE 'Carrier handoff config%'
              OR s.quickbase_last_error LIKE 'Carrier quickbase config%'
              OR s.quickbase_last_error LIKE 'Carrier has no partner_handoff_config%'
            ))::int,
        0
      ) AS historical_drift_rows
    FROM carriers c
    WHERE
      -- Carrier declares anderson_quickbase today...
      (c.partner_handoff_config ->> 'handoff_type') = 'anderson_quickbase'
      OR
      -- ...or has at least one stage row pointing at it (even if
      -- the config has since drifted away from anderson_quickbase
      -- entirely).
      EXISTS (
        SELECT 1 FROM partner_application_stages s WHERE s.carrier_id = c.id
      )
  `)) as unknown as Array<{
    carrier_id: string;
    carrier_name: string;
    cfg: unknown;
    pending_rows: number;
    historical_drift_rows: number;
  }>;

  const drifted: CarrierHandoffDriftRow[] = [];
  let totalPendingDoomed = 0;
  let totalHistoricalDriftRows = 0;

  for (const c of candidates) {
    const v = validateAndersonQuickbaseConfig(c.cfg);
    if (v.ok) continue; // valid — not drifted

    drifted.push({
      carrierId: c.carrier_id,
      carrierName: c.carrier_name,
      code: v.code,
      reason: v.reason,
      pendingRows: c.pending_rows,
      historicalDriftRows: c.historical_drift_rows,
      currentConfig: extractHandoffPrefill(c.cfg),
    });
    totalPendingDoomed += c.pending_rows;
    totalHistoricalDriftRows += c.historical_drift_rows;
  }

  // Sort: highest doomed count first, then highest historical, then
  // by name for stable rendering. The operator's eye lands on what's
  // most urgent.
  drifted.sort((a, b) => {
    if (b.pendingRows !== a.pendingRows) return b.pendingRows - a.pendingRows;
    if (b.historicalDriftRows !== a.historicalDriftRows) {
      return b.historicalDriftRows - a.historicalDriftRows;
    }
    return a.carrierName.localeCompare(b.carrierName);
  });

  return { drifted, totalPendingDoomed, totalHistoricalDriftRows };
}

/** Operational stats for the "you haven't applied yet" nudge runner
 *  shipped in commit a55e251. Drives the admin dashboard card so the
 *  operator can tell at a glance whether the runner is firing, what
 *  share of intakes get nudged, and whether the nudges convert. */
export interface ApplicationNudgeStats {
  /** Total status='sent' nudge rows, all time. */
  totalSent: number;
  /** status='sent' rows in the last 7 days. */
  sentLast7d: number;
  /** Split by which nudge in the 2-email series fired. */
  byNudgeIndex: { nudge1: number; nudge2: number };
  /** Total status='failed' rows — every send attempt that GHL bounced. */
  failedTotal: number;
  /** Total distinct drivers we've nudged at least once. */
  distinctDriversNudged: number;
  /** Distinct nudged drivers who later show at least one
   *  driverCarrierApplications row. Because the runner only fires
   *  on drivers with applications=0, any application is post-nudge —
   *  this is the conversion numerator. */
  distinctDriversConverted: number;
  /** Most recent sent_at across all rows; null when nothing has
   *  fired yet. Anchors the "last fired Xm ago" copy. */
  latestSentAt: Date | null;
}

export async function getApplicationNudgeStats(): Promise<ApplicationNudgeStats> {
  // Single grouped query for the count metrics — FILTER aggregates
  // give us per-status / per-index splits in one round trip.
  const aggRows = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE status = 'sent')::int AS total_sent,
      count(*) FILTER (
        WHERE status = 'sent'
          AND sent_at >= now() - interval '7 days'
      )::int AS sent_last_7d,
      count(*) FILTER (
        WHERE status = 'sent' AND nudge_index = 1
      )::int AS nudge_1,
      count(*) FILTER (
        WHERE status = 'sent' AND nudge_index = 2
      )::int AS nudge_2,
      count(*) FILTER (WHERE status = 'failed')::int AS failed_total,
      count(DISTINCT driver_id) FILTER (
        WHERE status = 'sent'
      )::int AS distinct_drivers_nudged,
      max(sent_at) FILTER (WHERE status = 'sent') AS latest_sent_at
    FROM driver_application_nudge_sends
  `)) as unknown as Array<{
    total_sent: number;
    sent_last_7d: number;
    nudge_1: number;
    nudge_2: number;
    failed_total: number;
    distinct_drivers_nudged: number;
    latest_sent_at: string | Date | null;
  }>;
  const agg = aggRows[0]!;

  // Conversion query — distinct nudged drivers who later created at
  // least one application row. The runner guards against double-
  // sending so a driver with applications can't appear in
  // driver_application_nudge_sends post-application; this lets us
  // treat any application as post-nudge for accounting purposes.
  const conversionRows = (await db.execute(sql`
    SELECT count(DISTINCT n.driver_id)::int AS converted
    FROM driver_application_nudge_sends n
    WHERE n.status = 'sent'
      AND EXISTS (
        SELECT 1
        FROM driver_carrier_applications a
        WHERE a.driver_id = n.driver_id
      )
  `)) as unknown as Array<{ converted: number }>;

  return {
    totalSent: agg.total_sent,
    sentLast7d: agg.sent_last_7d,
    byNudgeIndex: {
      nudge1: agg.nudge_1,
      nudge2: agg.nudge_2,
    },
    failedTotal: agg.failed_total,
    distinctDriversNudged: agg.distinct_drivers_nudged,
    distinctDriversConverted: conversionRows[0]?.converted ?? 0,
    latestSentAt: agg.latest_sent_at ? new Date(agg.latest_sent_at) : null,
  };
}

/** Operator-facing email opt-out signal. Lets the dashboard catch
 *  cadence-or-copy problems before they tank deliverability — if
 *  the recent unsubscribe rate exceeds ~2% per cohort, the runners
 *  are spamming someone. */
export interface UnsubscribeStats {
  /** Total drivers with a non-null unsubscribed_at, all time. */
  totalUnsubscribed: number;
  /** Drivers who unsubscribed in the last 7 days. */
  unsubscribedLast7d: number;
  /** Population denominator: drivers with a non-null email. The
   *  unsubscribe column is only relevant for drivers we can email,
   *  so we score the rate against the addressable population. */
  driversWithEmail: number;
  /** Most recent unsubscribed_at across all rows. Anchors the
   *  "last opt-out X ago" copy. Null when nobody has ever
   *  unsubscribed. */
  latestUnsubscribedAt: Date | null;
}

export async function getUnsubscribeStats(): Promise<UnsubscribeStats> {
  const rows = (await db.execute(sql`
    SELECT
      count(*) FILTER (
        WHERE unsubscribed_at IS NOT NULL
      )::int AS total_unsubscribed,
      count(*) FILTER (
        WHERE unsubscribed_at IS NOT NULL
          AND unsubscribed_at >= now() - interval '7 days'
      )::int AS unsubscribed_last_7d,
      count(*) FILTER (WHERE email IS NOT NULL)::int AS drivers_with_email,
      max(unsubscribed_at) AS latest_unsubscribed_at
    FROM drivers
  `)) as unknown as Array<{
    total_unsubscribed: number;
    unsubscribed_last_7d: number;
    drivers_with_email: number;
    latest_unsubscribed_at: string | Date | null;
  }>;
  const r = rows[0]!;
  return {
    totalUnsubscribed: r.total_unsubscribed,
    unsubscribedLast7d: r.unsubscribed_last_7d,
    driversWithEmail: r.drivers_with_email,
    latestUnsubscribedAt: r.latest_unsubscribed_at
      ? new Date(r.latest_unsubscribed_at)
      : null,
  };
}
