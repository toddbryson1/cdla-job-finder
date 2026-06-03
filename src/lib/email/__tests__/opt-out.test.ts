// Integration tests for the email opt-out checks. Seeds sentinel
// drivers + cleans up so the assertions are deterministic against
// the seeded state.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { drivers } from "@/db/schema";
import { driverOptOutReason, isDriverUnsubscribed } from "../opt-out";

const PREFIX = "opt-out-test+";

async function cleanup(): Promise<void> {
  await db
    .delete(drivers)
    .where(sql`${drivers.email} LIKE ${PREFIX + "%"}`);
}

async function seedDriver(
  suffix: string,
  overrides: { unsubscribedAt?: Date | null; deletedAt?: Date | null },
): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Opt",
      lastName: `Sentinel${suffix}`,
      email: `${PREFIX}${suffix}@example.com`,
      phone: "555-555-1234",
      homeZip: "30303",
      cdlState: "GA",
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
      unsubscribedAt: overrides.unsubscribedAt ?? null,
      deletedAt: overrides.deletedAt ?? null,
    })
    .returning({ id: drivers.id });
  return row!.id;
}

describe("isDriverUnsubscribed + driverOptOutReason", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("returns false / null for a driver who hasn't opted out", async () => {
    const id = await seedDriver("clean", {});
    expect(await isDriverUnsubscribed(db, id)).toBe(false);
    expect(await driverOptOutReason(db, id)).toBeNull();
  });

  it("treats unsubscribed_at as opt-out (reason: unsubscribed)", async () => {
    const id = await seedDriver("unsub", { unsubscribedAt: new Date() });
    expect(await isDriverUnsubscribed(db, id)).toBe(true);
    expect(await driverOptOutReason(db, id)).toBe("unsubscribed");
  });

  it("treats deleted_at as opt-out (reason: deleted)", async () => {
    const id = await seedDriver("deleted", { deletedAt: new Date() });
    expect(await isDriverUnsubscribed(db, id)).toBe(true);
    expect(await driverOptOutReason(db, id)).toBe("deleted");
  });

  it("deletion supersedes unsubscribe in the reason — both set returns 'deleted'", async () => {
    const id = await seedDriver("both", {
      unsubscribedAt: new Date(),
      deletedAt: new Date(),
    });
    expect(await isDriverUnsubscribed(db, id)).toBe(true);
    // The operator cares about the strongest signal — deletion is
    // terminal, unsubscribe can in theory be reversed in a future
    // re-subscription feature. "deleted" wins.
    expect(await driverOptOutReason(db, id)).toBe("deleted");
  });

  it("returns false / null for a driver id that doesn't exist", async () => {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    expect(await isDriverUnsubscribed(db, fakeId)).toBe(false);
    expect(await driverOptOutReason(db, fakeId)).toBeNull();
  });
});
