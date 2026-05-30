// Commit a DiscoveryReport to the pending_carriers staging tables.
// Idempotent: re-discovering the same carrier replaces its job set
// (we delete + re-insert) so the latest crawl is what's reviewed.

import { eq, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { pendingCarrierJobs, pendingCarriers } from "@/db/schema";
import { classifyApplicationSurface } from "./classify-surface";
import type { DiscoveryReport } from "./types";

export interface CommitDiscoveryInput {
  name: string;
  homepageUrl: string;
  /** Optional; overrides the report's first careers_page_lookup result. */
  careersUrl?: string;
  report: DiscoveryReport;
}

export interface CommitDiscoveryResult {
  pendingCarrierId: string;
  /** True when a row already existed and we updated it. */
  isReDiscovery: boolean;
  jobsInserted: number;
}

/**
 * Persist a DiscoveryReport into the staging tables. If a pending
 * carrier with the same lower(name) already exists, we update it in
 * place and replace its jobs. If it's already been promoted to a
 * live carrier, we refresh the staging row but flag a note so the
 * reviewer can decide whether to re-promote or merge.
 */
export async function commitDiscovery(
  input: CommitDiscoveryInput,
  database: typeof defaultDb = defaultDb,
): Promise<CommitDiscoveryResult> {
  const carrierHost = safeHost(input.homepageUrl);
  const careersUrl =
    input.careersUrl ??
    pickCareersUrlFromAttempts(input.report.attempts);

  // Find or create the pending_carriers row.
  const existing = await database
    .select({
      id: pendingCarriers.id,
      promotedCarrierId: pendingCarriers.promotedCarrierId,
    })
    .from(pendingCarriers)
    .where(sql`LOWER(${pendingCarriers.name}) = LOWER(${input.name})`)
    .limit(1);

  let pendingCarrierId: string;
  let isReDiscovery = false;

  if (existing.length === 0) {
    const [row] = await database
      .insert(pendingCarriers)
      .values({
        name: input.name,
        homepageUrl: input.homepageUrl,
        careersUrl,
        status: "pending",
        discoveryAttempts: input.report.attempts,
      })
      .returning({ id: pendingCarriers.id });
    pendingCarrierId = row.id;
  } else {
    pendingCarrierId = existing[0].id;
    isReDiscovery = true;

    const note = existing[0].promotedCarrierId
      ? "Re-discovered after promotion — review whether new jobs need to be merged into the live carrier."
      : null;

    await database
      .update(pendingCarriers)
      .set({
        homepageUrl: input.homepageUrl,
        careersUrl,
        discoveryAttempts: input.report.attempts,
        discoveredAt: new Date(),
        ...(note ? { notes: note } : {}),
      })
      .where(eq(pendingCarriers.id, pendingCarrierId));

    // Replace the job set wholesale.
    await database
      .delete(pendingCarrierJobs)
      .where(eq(pendingCarrierJobs.pendingCarrierId, pendingCarrierId));
  }

  // Insert jobs with classified application_surface.
  let jobsInserted = 0;
  if (input.report.jobs.length > 0) {
    const values = input.report.jobs.map((j) => {
      const { surface } = classifyApplicationSurface({
        applyUrl: j.applyUrl,
        carrierHost,
      });
      return {
        pendingCarrierId,
        source: j.source,
        sourceId: j.sourceId,
        title: j.title,
        description: j.description,
        carrierNameRaw: j.carrierName,
        city: j.city,
        state: j.state,
        lat: j.lat == null ? null : String(j.lat),
        lng: j.lng == null ? null : String(j.lng),
        equipmentGuess: j.equipmentGuess,
        payMinWeeklyUsd: j.payMinWeeklyUsd,
        payMaxWeeklyUsd: j.payMaxWeeklyUsd,
        payOriginalPeriod: j.payOriginalPeriod,
        applyUrl: j.applyUrl,
        postedAt: j.postedAt,
        applicationSurface: surface,
      };
    });
    const inserted = await database
      .insert(pendingCarrierJobs)
      .values(values)
      .returning({ id: pendingCarrierJobs.id });
    jobsInserted = inserted.length;
  }

  return { pendingCarrierId, isReDiscovery, jobsInserted };
}

function safeHost(u: string): string | undefined {
  try {
    return new URL(u).host;
  } catch {
    return undefined;
  }
}

function pickCareersUrlFromAttempts(
  attempts: DiscoveryReport["attempts"],
): string | undefined {
  // Look for the first "careers_page_lookup" attempt that succeeded
  // and pull the URL out of its note. Cheap heuristic — the
  // DiscoveryReport doesn't currently structure this separately.
  for (const a of attempts) {
    if (a.source === "careers_page_lookup" && a.ok) {
      const m = a.note.match(/https?:\/\/[^\s]+/);
      if (m) return m[0];
    }
  }
  return undefined;
}
