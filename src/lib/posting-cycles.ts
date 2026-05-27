// Posting-cycle spawner. Runs daily from /api/cron/daily.
//
// Lifecycle states (per job_posting_cycles row):
//   - active: this URL is live. validThrough = expires_at = posted_at + 20d.
//   - expired: expires_at <= now. Page returns 404, drops from sitemap.
//
// Three things this cron does each run:
//
//   1. Expire cycles past their expires_at. The URL stops working
//      (drops from Google's index naturally — they recrawl, see 404).
//   2. Backfill: every active carrier_job that has no active cycles
//      gets one created in the domicile city.
//   3. Repost: every carrier_job whose most recent cycle expired ≥3
//      days ago gets a new cycle. The new cycle:
//        - picks a city via @/lib/posting-cities (≥50 mi from any
//          other active cycle for the job, biased toward cities not
//          recently used)
//        - increments variant_index so the description copy looks
//          new to Google (3-template rotation in @/lib/job-seo-copy)
//        - posted_at = now(), expires_at = now() + 20 days
//
// User's spec mapping:
//   - "remove after 20 days": expires_at = posted_at + 20d → step 1
//   - "repost with different wording 3 days after": REPOST_DELAY_DAYS=3 + variant_index++
//   - "multiple cities ≥50 miles apart": city picker enforces spacing
//   - "rotate the primary city": city picker biases away from
//     recently-used cities

import { and, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  carrierJobs,
  jobPostingCycles,
  type carrierJobs as CarrierJobsTable,
} from "@/db/schema";
import { pickPostingCities, type PostingCity } from "@/lib/posting-cities";

type DB =
  | PostgresJsDatabase<Record<string, unknown>>
  | NodePgDatabase<Record<string, unknown>>;

type CarrierJob = typeof CarrierJobsTable.$inferSelect;

const POSTING_WINDOW_DAYS = 20;
const REPOST_DELAY_DAYS = 3;
const TARGET_CITIES_PER_JOB = 3; // primary + up to 2 secondaries
const VARIANT_TEMPLATE_COUNT = 3; // matches @/lib/job-seo-copy

export interface SpawnPostingCyclesResult {
  expired: number;
  spawned: number;
  jobsTouched: number;
}

export async function spawnPostingCycles(
  db: DB,
): Promise<SpawnPostingCyclesResult> {
  const out: SpawnPostingCyclesResult = {
    expired: 0,
    spawned: 0,
    jobsTouched: 0,
  };

  // 1. Expire cycles whose window has closed.
  const expiredRows = await db
    .update(jobPostingCycles)
    .set({ status: "expired" })
    .where(
      and(
        eq(jobPostingCycles.status, "active"),
        lte(jobPostingCycles.expiresAt, new Date()),
      ),
    )
    .returning({ id: jobPostingCycles.id });
  out.expired = expiredRows.length;

  // 2 + 3. For each active carrier_job, ensure it has enough active
  // cycles. Logic:
  //   - count active cycles for this job
  //   - if < TARGET_CITIES_PER_JOB, try to spawn more
  //   - BUT only if the most-recent cycle (active or expired) is ≥3
  //     days old (the repost cool-down rule)
  const jobs = await db
    .select()
    .from(carrierJobs)
    .where(eq(carrierJobs.status, "active"))
    .limit(5000);

  for (const job of jobs) {
    const touched = await ensureCyclesForJob(db, job);
    if (touched > 0) {
      out.spawned += touched;
      out.jobsTouched += 1;
    }
  }

  return out;
}

async function ensureCyclesForJob(
  db: DB,
  job: CarrierJob,
): Promise<number> {
  // Look up active cycles + the most recent cycle (any status) for cool-down.
  const allCycles = await db
    .select()
    .from(jobPostingCycles)
    .where(eq(jobPostingCycles.jobId, job.id))
    .orderBy(sql`${jobPostingCycles.postedAt} DESC`);

  const active = allCycles.filter((c) => c.status === "active");
  if (active.length >= TARGET_CITIES_PER_JOB) {
    return 0;
  }

  // Cool-down: most recent cycle for this job (active or expired) must
  // be ≥REPOST_DELAY_DAYS old before we spawn another. This enforces
  // "3 days after expiration" for reposts AND "spaced out, not all
  // spawned the same day" for initial multi-city seeding.
  if (allCycles.length > 0) {
    const mostRecent = allCycles[0];
    const ageMs = Date.now() - new Date(mostRecent.postedAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    // Exception: if no ACTIVE cycles exist (e.g., all expired), allow
    // the new one only after REPOST_DELAY_DAYS.
    // If active cycles exist but < target, also wait — staggers spawns.
    if (ageDays < REPOST_DELAY_DAYS) {
      return 0;
    }
  }

  // Pick cities, skipping ones with active cycles already.
  const candidates = await pickPostingCities(job, {
    maxCities: TARGET_CITIES_PER_JOB - active.length,
  });
  if (candidates.length === 0) return 0;

  // Determine the next variant_index. We rotate per (job) so each
  // repost across the entire job (any city) gets fresh copy. Take the
  // max variant_index across this job's cycles and increment.
  const maxVariant = allCycles.reduce(
    (max, c) => Math.max(max, c.variantIndex),
    -1,
  );

  // Determine cycle_index per city — we want each (job, city) pair to
  // have its own incrementing counter.
  const cityCounters = new Map<string, number>();
  for (const c of allCycles) {
    const key = cycleKey(c.city, c.state);
    cityCounters.set(key, Math.max(cityCounters.get(key) ?? 0, c.cycleIndex));
  }

  // The new "primary" is the city we add first this run — typically the
  // domicile when no cycles exist, or the next-best candidate during
  // rotation. We always demote existing actives off `is_primary` first
  // so there's only one primary at a time per job.
  const hadActivePrimary = active.some((c) => c.isPrimary);

  const now = new Date();
  const inserted = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const key = cycleKey(c.city, c.state);
    const nextCycleIndex = (cityCounters.get(key) ?? 0) + 1;
    const variantIndex =
      (maxVariant + 1 + i) % VARIANT_TEMPLATE_COUNT;
    const expiresAt = new Date(now);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + POSTING_WINDOW_DAYS);

    inserted.push({
      jobId: job.id,
      city: c.city,
      state: c.state,
      zip: c.zip,
      lat: String(c.lat),
      lng: String(c.lng),
      cycleIndex: nextCycleIndex,
      variantIndex,
      isPrimary: !hadActivePrimary && i === 0,
      postedAt: now,
      expiresAt,
      status: "active" as const,
    });
    cityCounters.set(key, nextCycleIndex);
  }

  if (inserted.length === 0) return 0;

  // If we're spawning a new primary and there's an old primary, demote it.
  if (!hadActivePrimary && inserted.length > 0) {
    // No-op — there's no current primary to demote. If there were one,
    // we wouldn't be in this branch.
  } else if (inserted.some((r) => r.isPrimary)) {
    await db
      .update(jobPostingCycles)
      .set({ isPrimary: false })
      .where(
        and(
          eq(jobPostingCycles.jobId, job.id),
          eq(jobPostingCycles.isPrimary, true),
        ),
      );
  }

  await db.insert(jobPostingCycles).values(inserted);
  return inserted.length;
}

function cycleKey(city: string, state: string): string {
  return `${city.toLowerCase()}|${state.toUpperCase()}`;
}

/**
 * Resolve the cycle id-prefix from a slug. Slug format mirrors the
 * carrier_job slug exactly — same buildJobPostingSlug helper — except
 * the trailing 8-char hex prefix is the CYCLE id, not the job id.
 * That lets the same job exist at multiple URLs simultaneously, one
 * per active cycle.
 */
export function postingCycleIdPrefixFromSlug(slug: string): string | null {
  const trimmed = slug.trim().toLowerCase();
  const lastDash = trimmed.lastIndexOf("-");
  if (lastDash < 0) return null;
  const candidate = trimmed.slice(lastDash + 1);
  if (!/^[0-9a-f]{8}$/.test(candidate)) return null;
  return candidate;
}
