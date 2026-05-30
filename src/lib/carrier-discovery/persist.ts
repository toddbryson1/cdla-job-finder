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
  const careersUrl =
    input.careersUrl ??
    pickCareersUrlFromAttempts(input.report.attempts);
  // All hosts the crawler walked through. Used by the classifier so
  // a carrier whose jobs board lives on a sibling domain (e.g.
  // heartlandexpress.com → driveheartland.com) still classifies as
  // a self-hosted custom_intake_form, not "unknown".
  const carrierHosts = collectCarrierHosts(
    input.homepageUrl,
    careersUrl,
    input.report.attempts,
  );

  // Find or create the pending_carriers row.
  const existing = await database
    .select({
      id: pendingCarriers.id,
      promotedCarrierId: pendingCarriers.promotedCarrierId,
      applyUrlOverride: pendingCarriers.applyUrlOverride,
    })
    .from(pendingCarriers)
    .where(sql`LOWER(${pendingCarriers.name}) = LOWER(${input.name})`)
    .limit(1);

  let pendingCarrierId: string;
  let isReDiscovery = false;
  // Operator-set override (Tenstreet IntelliApp URL) — preserved
  // across re-discovery so the crawler can refresh the job set
  // without overwriting the curated apply URL.
  let applyUrlOverride: string | null = null;

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
    applyUrlOverride = existing[0].applyUrlOverride;

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

  // Insert jobs with classified application_surface. If the carrier
  // has an operator-set apply_url_override (e.g. their Tenstreet
  // IntelliApp link), every job uses that URL and we re-classify
  // the surface from the override host instead of the crawler's
  // bouncing aggregator URL.
  let jobsInserted = 0;
  if (input.report.jobs.length > 0) {
    const values = input.report.jobs.map((j) => {
      const finalApplyUrl = applyUrlOverride ?? j.applyUrl;
      const { surface } = classifyApplicationSurface({
        applyUrl: finalApplyUrl,
        carrierHosts,
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
        applyUrl: finalApplyUrl,
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

/**
 * Collect every URL the crawler touched and return their host set.
 * That gives the surface classifier enough context to treat a
 * cross-origin job-board subdomain as "the carrier itself."
 */
function collectCarrierHosts(
  homepageUrl: string,
  careersUrl: string | undefined,
  attempts: DiscoveryReport["attempts"],
): string[] {
  const hosts = new Set<string>();
  const add = (u: string | undefined) => {
    if (!u) return;
    const h = safeHost(u);
    if (h) hosts.add(h);
  };
  add(homepageUrl);
  add(careersUrl);
  for (const a of attempts) {
    const matches = a.note.match(/https?:\/\/[^\s)]+/g);
    if (!matches) continue;
    for (const m of matches) add(m);
  }
  return Array.from(hosts);
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
