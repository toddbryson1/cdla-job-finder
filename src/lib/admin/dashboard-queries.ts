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
