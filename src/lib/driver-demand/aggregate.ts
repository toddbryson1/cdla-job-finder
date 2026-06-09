// Driver demand — the AGGREGATE-ONLY prospecting layer.
//
// This module is the single sanctioned path for turning the driver
// database into a demand signal ("we already have ~40 drivers wanting
// home-weekly reefer in the Mountain West") for carrier recruitment.
//
// THE PRIVACY LINE (SPEC_driver-preference-and-demand-database-v1.md §2,
// non-negotiable, architectural):
//
//   A prospective (non-partner) carrier NEVER receives individual driver
//   data. This layer must be PHYSICALLY INCAPABLE of returning individual
//   identifiers — enforced here in the access layer, not by policy.
//
// How that's enforced in this file:
//   1. Every query SELECTs only bucket columns (state, equipment, schedule,
//      priority) + COUNT(*). The identifier columns (id, first_name,
//      last_name, email, phone, home_zip, home_lat/lng) are NEVER named in
//      any SELECT here. There is no code path that returns a driver row.
//   2. Small-cell suppression: any bucket whose count is below
//      MIN_GROUP_SIZE is dropped, so a cell can never narrow to a single
//      identifiable person ("the one hazmat tanker driver in rural WY").
//   3. assertAggregateOnly() is a belt-and-suspenders runtime guard that
//      throws if any returned object ever carries a forbidden key. Pinned
//      by aggregate.test.ts.
//
// Deleted drivers (deleted_at IS NOT NULL) are excluded everywhere — a
// CCPA-erased row must not resurface even as an anonymous count.

import { sql } from "drizzle-orm";
import { db } from "@/db/client";

// Minimum group size before an aggregate cell may be reported. Cells
// smaller than this are suppressed to prevent re-identification. Start
// conservative (spec §8.2 calls for an explicit threshold); ops-tunable.
export const MIN_GROUP_SIZE = 5;

// Keys that must NEVER appear on anything this module returns. The guard
// below throws if one ever does. Kept in sync with the identifier/PII
// columns on the drivers table.
const FORBIDDEN_KEYS = new Set<string>([
  "id",
  "driver_id",
  "driverId",
  "first_name",
  "firstName",
  "last_name",
  "lastName",
  "email",
  "phone",
  "home_zip",
  "homeZip",
  "home_lat",
  "home_lng",
  "address_street",
  "address_city",
]);

/**
 * Belt-and-suspenders runtime assertion: every object handed back by this
 * module must carry ONLY aggregate keys. Throws (rather than silently
 * leaking) if a forbidden identifier key is ever present. The real
 * guarantee is that the SQL never selects identifiers; this catches a
 * future careless edit.
 */
export function assertAggregateOnly<T extends object>(rows: T[]): T[] {
  for (const row of rows) {
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(
          `driver-demand aggregate layer leaked a forbidden identifier key: "${key}". ` +
            `This path must be incapable of returning individual driver data.`,
        );
      }
    }
  }
  return rows;
}

function suppressSmall<T extends { driverCount: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.driverCount >= MIN_GROUP_SIZE);
}

export interface StateEquipmentDemandCell {
  cdlState: string;
  desiredEquipment: string;
  driverCount: number;
}

/**
 * Driver demand by (CDL state × desired equipment). Powers the
 * "we already have the drivers" carrier pitch. Small cells suppressed.
 */
export async function driverDemandByStateAndEquipment(): Promise<
  StateEquipmentDemandCell[]
> {
  const rows = (await db.execute(sql`
    SELECT d.cdl_state AS "cdlState",
           equip AS "desiredEquipment",
           COUNT(*)::int AS "driverCount"
    FROM drivers d
    CROSS JOIN LATERAL unnest(d.desired_equipment) AS equip
    WHERE d.deleted_at IS NULL
    GROUP BY d.cdl_state, equip
    ORDER BY "driverCount" DESC
  `)) as unknown as StateEquipmentDemandCell[];
  return assertAggregateOnly(suppressSmall(rows));
}

export interface UnmetDemandCell {
  cdlState: string;
  desiredEquipment: string;
  driverCount: number;
}

/**
 * The carrier-RECRUITMENT target list: drivers flagged re_match_eligible
 * with a recorded no_match_reason (i.e. zero/weak matches today),
 * bucketed by where + what they want. This is what tells us which carrier
 * TYPES to go sign next. Small cells suppressed.
 */
export async function unmetDemandByStateAndEquipment(): Promise<
  UnmetDemandCell[]
> {
  const rows = (await db.execute(sql`
    SELECT d.cdl_state AS "cdlState",
           equip AS "desiredEquipment",
           COUNT(*)::int AS "driverCount"
    FROM drivers d
    CROSS JOIN LATERAL unnest(d.desired_equipment) AS equip
    WHERE d.deleted_at IS NULL
      AND d.re_match_eligible = true
      AND d.no_match_reason IS NOT NULL
    GROUP BY d.cdl_state, equip
    ORDER BY "driverCount" DESC
  `)) as unknown as UnmetDemandCell[];
  return assertAggregateOnly(suppressSmall(rows));
}

export interface PriorityDistributionCell {
  cdlState: string;
  topPriority: string;
  driverCount: number;
}

/**
 * Distribution of the driver's #1 stated priority (the first element of
 * priority_ranking) by state — "do Mountain West drivers want home time
 * or pay?" Only rows where priority_ranking is populated count. Small
 * cells suppressed.
 */
export async function topPriorityDistributionByState(): Promise<
  PriorityDistributionCell[]
> {
  const rows = (await db.execute(sql`
    SELECT d.cdl_state AS "cdlState",
           d.priority_ranking[1] AS "topPriority",
           COUNT(*)::int AS "driverCount"
    FROM drivers d
    WHERE d.deleted_at IS NULL
      AND d.priority_ranking IS NOT NULL
      AND array_length(d.priority_ranking, 1) >= 1
    GROUP BY d.cdl_state, d.priority_ranking[1]
    ORDER BY "driverCount" DESC
  `)) as unknown as PriorityDistributionCell[];
  return assertAggregateOnly(suppressSmall(rows));
}
