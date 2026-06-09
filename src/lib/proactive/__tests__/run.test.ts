import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { driverProactiveContacts, drivers } from "@/db/schema";
import { processProactiveCandidate } from "@/lib/proactive/run";
import type { ProactiveCandidate } from "@/lib/proactive/triggers";
import { clearDrivers, insertTestDriver } from "@/lib/matching/__tests__/testHelpers";

// The load-bearing guarantee: with PROACTIVE_SENDS_ENABLED off, NOTHING
// is ever delivered. The governance spine runs, decisions are recorded,
// but no row ever reaches 'sent' and the (unimplemented) channel is never
// touched.

const NOW = new Date("2026-06-09T12:00:00Z");

const candidate: ProactiveCandidate = {
  triggerType: "milestone",
  reason: "You're about a month from the 12-month mark.",
  materialityDetail: "nearing 12mo",
};

async function contactsFor(driverId: string) {
  return db
    .select()
    .from(driverProactiveContacts)
    .where(eq(driverProactiveContacts.driverId, driverId));
}

describe("processProactiveCandidate — send gate (flag OFF)", () => {
  beforeEach(async () => {
    delete process.env.PROACTIVE_SENDS_ENABLED; // ensure disabled
    await clearDrivers();
  });
  afterAll(clearDrivers);

  it("records blocked_disabled and delivers NOTHING when sends are off", async () => {
    const id = await insertTestDriver({ homeLat: "33.7", homeLng: "-84.3" });
    const outcome = await processProactiveCandidate(id, candidate, "sms", NOW);

    expect(outcome.status).toBe("blocked_disabled");
    expect(outcome.skipReason).toBe("sends_disabled");

    const rows = await contactsFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("blocked_disabled");
    expect(rows[0].sentAt).toBeNull();
    // The non-negotiable: no proactive contact is ever 'sent' with the
    // flag off.
    expect(rows.some((r) => r.status === "sent")).toBe(false);
  });

  it("suppresses (does not block-disable) when governance stops it first", async () => {
    const id = await insertTestDriver({ homeLat: "33.7", homeLng: "-84.3" });
    // Mark the driver unsubscribed → permanent stop, ahead of the send gate.
    await db
      .update(drivers)
      .set({ unsubscribedAt: NOW })
      .where(eq(drivers.id, id));

    const outcome = await processProactiveCandidate(id, candidate, "sms", NOW);
    expect(outcome.status).toBe("suppressed");
    expect(outcome.skipReason).toBe("opted_out");

    const rows = await contactsFor(id);
    expect(rows[0].status).toBe("suppressed");
    expect(rows.some((r) => r.status === "sent")).toBe(false);
  });
});
