// Funnel event recorder.
//
// Writes append-only rows to funnel_events (see schema.ts + migration
// 0033). The point is drop-off analysis the state-derived admin funnel
// can't do: "driver hit /matches with N matches at T and never
// consented" isn't a transition on any durable row, so we log it as a
// discrete event here.
//
// Recording is BEST-EFFORT and must never affect the request it's
// instrumenting. recordFunnelEvent swallows everything and resolves to
// a boolean; callers fire it with `void` and move on — same pattern as
// recordExternalImpressions on the /matches page. Analytics that breaks
// the page it measures is worse than no analytics.

import { db } from "@/db/client";
import { funnelEvents } from "@/db/schema";

/**
 * The set of event types we emit today. The column is open text so new
 * call sites don't need a migration, but pinning the emitted set here
 * keeps producers and the admin reader honest about what actually
 * exists. Add a value when you add its call site — not before.
 *
 *   - matches_viewed: driver landed on /matches (matchCount = cards seen)
 *   - consent_submitted: driver completed Stage 2 consent for a carrier
 *     (carrierId set). Pairs with matches_viewed for a view→consent
 *     funnel measured from events, not just reconstructed state.
 */
export type FunnelEventType = "matches_viewed" | "consent_submitted";

export interface RecordFunnelEventInput {
  eventType: FunnelEventType;
  /** Null for events not tied to a known driver (shouldn't happen for
   *  matches_viewed, but the column is nullable for future events). */
  driverId?: string | null;
  /** View-style events: how many cards the driver actually saw. */
  matchCount?: number | null;
  /** Carrier-scoped events. Null for matches_viewed. */
  carrierId?: string | null;
  /** Shallow event-specific detail (e.g. internal vs external split). */
  metadata?: Record<string, unknown> | null;
}

/**
 * Best-effort insert. Returns true on success, false if anything threw
 * (and logs it). Never rejects — safe to `void` at any call site.
 */
export async function recordFunnelEvent(
  input: RecordFunnelEventInput,
): Promise<boolean> {
  try {
    await db.insert(funnelEvents).values({
      eventType: input.eventType,
      driverId: input.driverId ?? null,
      matchCount: input.matchCount ?? null,
      carrierId: input.carrierId ?? null,
      metadata: input.metadata ?? null,
    });
    return true;
  } catch (err) {
    console.error(
      "[funnel-events] record failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return false;
  }
}
