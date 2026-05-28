// Daily run planner for the content machine.
//
// Three responsibilities, kept separate so they can be unit-tested:
//   1. bucketsForCount  — which buckets to cover today (the 3.3 sequencer)
//   2. pickTopic        — for a bucket, pick the oldest active topic,
//                         preferring requires_data=false when no verified
//                         figures are available
//   3. pickRegion       — pick the oldest active region (shared across
//                         all buckets in the day for thematic coherence)
//
// planDailyRun() composes them and returns the (bucket, topic, region)
// triples the run will generate, plus the cursor value to persist after
// the run completes. See spec Sections 3.1, 3.2, 3.3.

import { and, asc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  articleRegions,
  articleTopics,
  contentMachineState,
} from "@/db/schema";

export type DailyCount = 1 | 2 | 3 | 4;
export type Bucket = 1 | 2 | 3 | 4;

export interface PickedTopic {
  id: string;
  topic: string;
  regionScoped: boolean;
  requiresData: boolean;
}

export interface PickedRegion {
  id: string;
  city: string;
  state: string;
}

export interface DailyPick {
  bucket: Bucket;
  topic: PickedTopic;
}

export interface DailyPlan {
  region: PickedRegion | null;
  picks: DailyPick[];
  cursorBefore: number;
  cursorAfter: number;
}

/**
 * Bucket-skip sequencer for count<4. Returns the buckets to cover today
 * given the running cursor. Cursor advances by 1 after each run.
 *
 *   count=1: B1, B2, B3, B4, B1, ...      (cycle of 4)
 *   count=2: [B1,B3], [B2,B4], ...        (cycle of 2)
 *   count=3: skip B1, skip B2, ...        (cycle of 4)
 *   count=4: always all four              (cursor ignored)
 */
export function bucketsForCount(count: DailyCount, cursor: number): Bucket[] {
  if (count === 4) return [1, 2, 3, 4];
  if (count === 1) return [((cursor % 4) + 1) as Bucket];
  if (count === 2) return cursor % 2 === 0 ? [1, 3] : [2, 4];
  // count === 3: rotate which bucket gets skipped
  const skip = ((cursor % 4) + 1) as Bucket;
  return ([1, 2, 3, 4] as Bucket[]).filter((b) => b !== skip);
}

/**
 * Per spec Section 3.1: pick the oldest active topic in a bucket. When
 * no verified data is available, prefer requires_data=false topics
 * (the requires_data ordering takes precedence over last_used_at so
 * data-needing topics get held back until data exists).
 *
 * Returns null only if the bucket has no active topics at all.
 */
export async function pickTopic(
  db: PostgresJsDatabase<Record<string, unknown>>,
  bucket: Bucket,
  hasVerifiedData: boolean,
): Promise<PickedTopic | null> {
  const rows = await db
    .select({
      id: articleTopics.id,
      topic: articleTopics.topic,
      regionScoped: articleTopics.regionScoped,
      requiresData: articleTopics.requiresData,
    })
    .from(articleTopics)
    .where(
      and(eq(articleTopics.bucket, bucket), eq(articleTopics.active, true)),
    )
    .orderBy(
      // requires_data=false first when no data; otherwise both treated equally
      hasVerifiedData
        ? sql`${articleTopics.lastUsedAt} ASC NULLS FIRST`
        : sql`${articleTopics.requiresData} ASC, ${articleTopics.lastUsedAt} ASC NULLS FIRST`,
      asc(articleTopics.id),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Pick the oldest active region for today's batch. The same region
 * applies to all buckets. Returns null if no active regions exist
 * (caller must treat this as "national" or skip region-scoped topics).
 */
export async function pickRegion(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<PickedRegion | null> {
  const rows = await db
    .select({
      id: articleRegions.id,
      city: articleRegions.city,
      state: articleRegions.state,
    })
    .from(articleRegions)
    .where(eq(articleRegions.active, true))
    .orderBy(sql`${articleRegions.lastUsedAt} ASC NULLS FIRST`, asc(articleRegions.id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Read the singleton cursor, defaulting to 0 if the row is somehow
 * missing (the seed migration inserts id=1, but defensive read).
 */
export async function readCursor(db: PostgresJsDatabase<Record<string, unknown>>): Promise<number> {
  const rows = await db
    .select({ cursor: contentMachineState.lastBucketCursor })
    .from(contentMachineState)
    .where(eq(contentMachineState.id, 1))
    .limit(1);
  return rows[0]?.cursor ?? 0;
}

/**
 * Plan today's run. Composes pickRegion + bucketsForCount + pickTopic.
 * The caller persists the cursor and marks topics/region used only
 * after the corresponding article successfully publishes.
 */
export async function planDailyRun(opts: {
  db: PostgresJsDatabase<Record<string, unknown>>;
  count: DailyCount;
  hasVerifiedData: boolean;
}): Promise<DailyPlan> {
  const { db, count, hasVerifiedData } = opts;
  const cursorBefore = await readCursor(db);
  const region = await pickRegion(db);
  const buckets = bucketsForCount(count, cursorBefore);

  const picks: DailyPick[] = [];
  for (const bucket of buckets) {
    const topic = await pickTopic(db, bucket, hasVerifiedData);
    if (topic) picks.push({ bucket, topic });
  }

  return {
    region,
    picks,
    cursorBefore,
    cursorAfter: cursorBefore + 1,
  };
}

/**
 * Persist last_used_at on a topic after its article publishes. Caller
 * decides what counts as "used" — published, or just generated.
 */
export async function markTopicUsed(
  db: PostgresJsDatabase<Record<string, unknown>>,
  topicId: string,
): Promise<void> {
  await db
    .update(articleTopics)
    .set({ lastUsedAt: new Date() })
    .where(eq(articleTopics.id, topicId));
}

/**
 * Persist last_used_at on a region after the day's batch completes.
 * Called once per run, not per article.
 */
export async function markRegionUsed(
  db: PostgresJsDatabase<Record<string, unknown>>,
  regionId: string,
): Promise<void> {
  await db
    .update(articleRegions)
    .set({ lastUsedAt: new Date() })
    .where(eq(articleRegions.id, regionId));
}

/**
 * Persist the bucket cursor + last_run_date. Run-level, called once
 * per cron invocation regardless of per-article outcomes.
 */
export async function advanceCursor(
  db: PostgresJsDatabase<Record<string, unknown>>,
  newCursor: number,
  runDate: Date,
): Promise<void> {
  await db
    .update(contentMachineState)
    .set({
      lastBucketCursor: newCursor,
      lastRunDate: runDate.toISOString().slice(0, 10),
      updatedAt: new Date(),
    })
    .where(eq(contentMachineState.id, 1));
}
