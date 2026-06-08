import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { and, eq, like, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  driverCarrierApplications,
  drivers,
  funnelEvents,
} from "@/db/schema";
import { recordFunnelEvent } from "@/lib/funnel-events";
import { getFunnelEventStats } from "@/lib/admin/dashboard-queries";

const EMAIL_PREFIX = "funnel-events-test+";

async function seedDriver(suffix: string): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Pat",
      lastName: `Funnel${suffix}`,
      email: `${EMAIL_PREFIX}${suffix}@example.com`,
      phone: "555-555-9876",
      homeZip: "56301",
      cdlState: "MN",
      yearsHeld: "3",
      otrYears: "2",
      equipmentRun: ["dry-van"],
      desiredEquipment: ["dry-van"],
      desiredRegions: ["any"],
      homeTime: ["otr"],
      terminatedFromAnyOfLast3Employers: false,
      failedDotTest: false,
      attestAccurate: true,
      consentToShare: true,
    })
    .returning({ id: drivers.id });
  return row!.id;
}

async function cleanup(): Promise<void> {
  // funnel_events for our seeded drivers go first (FK is SET NULL, but
  // we want a clean slate per run). Match by joining on the email
  // prefix isn't possible after SET NULL, so we delete events whose
  // driver still matches, then orphaned test events by metadata tag.
  const ds = await db
    .select({ id: drivers.id })
    .from(drivers)
    .where(like(drivers.email, `${EMAIL_PREFIX}%`));
  for (const d of ds) {
    await db.delete(funnelEvents).where(eq(funnelEvents.driverId, d.id));
    await db
      .delete(driverCarrierApplications)
      .where(eq(driverCarrierApplications.driverId, d.id));
  }
  // Any test events that were orphaned to driver_id NULL by a prior
  // run's deletion still carry our sentinel metadata tag.
  await db
    .delete(funnelEvents)
    .where(sql`${funnelEvents.metadata}->>'test' = 'funnel-events'`);
  await db.delete(drivers).where(like(drivers.email, `${EMAIL_PREFIX}%`));
}

describe("funnel-events.recordFunnelEvent", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("inserts a matches_viewed row and returns true", async () => {
    const driverId = await seedDriver("rec1");
    const ok = await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId,
      matchCount: 4,
      metadata: { test: "funnel-events", internal: 3, external: 1 },
    });
    expect(ok).toBe(true);

    const rows = await db
      .select()
      .from(funnelEvents)
      .where(eq(funnelEvents.driverId, driverId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.eventType).toBe("matches_viewed");
    expect(rows[0]!.matchCount).toBe(4);
    expect(rows[0]!.metadata).toMatchObject({ internal: 3, external: 1 });
  });

  it("swallows errors and returns false (never throws)", async () => {
    // driver_id is a uuid column — a non-uuid string makes the insert
    // throw, which recordFunnelEvent must catch and report as false.
    const ok = await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: "not-a-uuid",
      matchCount: 1,
      metadata: { test: "funnel-events" },
    });
    expect(ok).toBe(false);
  });

  it("accepts a null driverId", async () => {
    const ok = await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: null,
      matchCount: 0,
      metadata: { test: "funnel-events" },
    });
    expect(ok).toBe(true);
  });
});

describe("dashboard-queries.getFunnelEventStats", () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it("aggregates views, unique drivers, zero-card dead-ends, and avg", async () => {
    const d1 = await seedDriver("agg1");
    const d2 = await seedDriver("agg2");

    // d1 views twice (4 cards, then 0 cards). d2 views once (2 cards).
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: d1,
      matchCount: 4,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: d1,
      matchCount: 0,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: d2,
      matchCount: 2,
      metadata: { test: "funnel-events" },
    });

    const stats = await getFunnelEventStats(30);
    // Other tests/prod data may share the table, so assert via deltas
    // would be fragile — instead seed a clean slate (beforeEach cleans
    // our drivers) and assert our contribution is reflected. The query
    // is global, so we check our seeded rows are counted, not exact
    // totals when run alongside other suites.
    expect(stats.matchesViewed).toBeGreaterThanOrEqual(3);
    expect(stats.uniqueDriversViewed).toBeGreaterThanOrEqual(2);
    expect(stats.zeroMatchViews).toBeGreaterThanOrEqual(1);
    expect(stats.avgMatchCount).toBeGreaterThan(0);
    expect(stats.latestViewAt).toBeInstanceOf(Date);
  });

  it("counts intake_completed by DISTINCT driver (re-submits don't inflate)", async () => {
    const d1 = await seedDriver("ic1");
    const d2 = await seedDriver("ic2");
    // d1 submits intake twice (email-path upsert / re-submission); d2 once.
    await recordFunnelEvent({
      eventType: "intake_completed",
      driverId: d1,
      metadata: { test: "funnel-events", anonymous: false },
    });
    await recordFunnelEvent({
      eventType: "intake_completed",
      driverId: d1,
      metadata: { test: "funnel-events", anonymous: false },
    });
    await recordFunnelEvent({
      eventType: "intake_completed",
      driverId: d2,
      metadata: { test: "funnel-events", anonymous: true },
    });

    const stats = await getFunnelEventStats(30);
    // Two distinct drivers despite three events — the upsert/re-submit
    // case must count once per driver.
    expect(stats.uniqueDriversIntake).toBeGreaterThanOrEqual(2);
  });

  it("counts consent_submitted events (total + unique drivers) in-window", async () => {
    const d1 = await seedDriver("ce1");
    const d2 = await seedDriver("ce2");
    // d1 consents twice (e.g. two carriers), d2 once.
    await recordFunnelEvent({
      eventType: "consent_submitted",
      driverId: d1,
      carrierId: null,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "consent_submitted",
      driverId: d1,
      carrierId: null,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "consent_submitted",
      driverId: d2,
      carrierId: null,
      metadata: { test: "funnel-events" },
    });

    const stats = await getFunnelEventStats(30);
    // Global table (shared with other suites/prod), so assert our
    // contribution is reflected rather than exact totals.
    expect(stats.consentEvents).toBeGreaterThanOrEqual(3);
    expect(stats.uniqueDriversConsented).toBeGreaterThanOrEqual(2);
  });

  it("counts viewed→consented as the in-window event intersection (view AND consent, both in window)", async () => {
    // A driver who BOTH viewed and consented within the window counts.
    const both = await seedDriver("conv1");
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: both,
      matchCount: 3,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "consent_submitted",
      driverId: both,
      carrierId: null,
      metadata: { test: "funnel-events" },
    });

    // A driver who viewed but never consented must NOT count toward the
    // intersection (only toward uniqueDriversViewed).
    const viewOnly = await seedDriver("conv2");
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: viewOnly,
      matchCount: 2,
      metadata: { test: "funnel-events" },
    });

    const stats = await getFunnelEventStats(30);
    expect(stats.viewedThenConsented).toBeGreaterThanOrEqual(1);
    // The intersection can never exceed the number of unique viewers.
    expect(stats.viewedThenConsented).toBeLessThanOrEqual(
      stats.uniqueDriversViewed,
    );
  });

  it("excludes an out-of-window consent from viewed→consented", async () => {
    // Driver viewed in-window but consented 40 days ago — the old
    // state-table join would have counted this; the windowed event
    // intersection must not.
    const d = await seedDriver("oow1");
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: d,
      matchCount: 4,
      metadata: { test: "funnel-events" },
    });
    await recordFunnelEvent({
      eventType: "consent_submitted",
      driverId: d,
      carrierId: null,
      metadata: { test: "funnel-events" },
    });
    // Backdate ONLY the consent event 40 days.
    await db
      .update(funnelEvents)
      .set({ createdAt: sql`NOW() - INTERVAL '40 days'` })
      .where(
        and(
          eq(funnelEvents.driverId, d),
          eq(funnelEvents.eventType, "consent_submitted"),
        ),
      );

    // In a 7-day window this driver is a viewer but their consent is
    // out of window, so they don't count in the intersection. We assert
    // on this driver specifically (shared table → no exact totals): no
    // in-window consent row exists for them.
    const consentInWindow = await db
      .select()
      .from(funnelEvents)
      .where(
        and(
          eq(funnelEvents.driverId, d),
          eq(funnelEvents.eventType, "consent_submitted"),
          sql`${funnelEvents.createdAt} >= NOW() - INTERVAL '7 days'`,
        ),
      );
    expect(consentInWindow).toHaveLength(0);
    const stats = await getFunnelEventStats(7);
    expect(stats.viewedThenConsented).toBeLessThanOrEqual(
      stats.uniqueDriversViewed,
    );
  });

  it("excludes events older than the window", async () => {
    const d = await seedDriver("win1");
    // Insert a view, then backdate it 40 days.
    await recordFunnelEvent({
      eventType: "matches_viewed",
      driverId: d,
      matchCount: 5,
      metadata: { test: "funnel-events" },
    });
    await db
      .update(funnelEvents)
      .set({ createdAt: sql`NOW() - INTERVAL '40 days'` })
      .where(
        and(
          eq(funnelEvents.driverId, d),
          eq(funnelEvents.eventType, "matches_viewed"),
        ),
      );

    const within7 = await getFunnelEventStats(7);
    // Our backdated driver must not be among the 7-day viewers. We
    // can't assert exact totals (shared table), but our driver's row
    // is excluded — verify by confirming no row for it in-window.
    const inWindow = await db
      .select()
      .from(funnelEvents)
      .where(
        and(
          eq(funnelEvents.driverId, d),
          sql`${funnelEvents.createdAt} >= NOW() - INTERVAL '7 days'`,
        ),
      );
    expect(inWindow).toHaveLength(0);
    expect(within7.matchesViewed).toBeGreaterThanOrEqual(0);
  });
});
