import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carriers, drivers } from "@/db/schema";
import {
  dismissCarrier,
  getDismissedCarrierIds,
  undismissCarrier,
} from "..";

const DRIVER_EMAIL_PREFIX = "dismissals-test+";
const CARRIER_NAME = "Dismissals Test Carrier (sentinel)";

async function cleanup(): Promise<void> {
  await db
    .delete(drivers)
    .where(sql`${drivers.email} LIKE ${DRIVER_EMAIL_PREFIX + "%"}`);
  await db.delete(carriers).where(eq(carriers.name, CARRIER_NAME));
}

async function seedDriver(suffix: string): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Dis",
      lastName: `Sentinel${suffix}`,
      email: `${DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
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
    })
    .returning({ id: drivers.id });
  return row!.id;
}

async function seedCarrier(): Promise<string> {
  const [row] = await db
    .insert(carriers)
    .values({
      name: CARRIER_NAME,
      kind: "partner",
      tier: "none",
      status: "active",
    })
    .returning({ id: carriers.id });
  return row!.id;
}

describe("dismissals helpers", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("returns empty Set when nothing dismissed", async () => {
    const id = await seedDriver("empty");
    const dismissed = await getDismissedCarrierIds(id);
    expect(dismissed.size).toBe(0);
  });

  it("records a dismissal and returns it on subsequent reads", async () => {
    const drv = await seedDriver("dismiss1");
    const carrier = await seedCarrier();
    await dismissCarrier(drv, carrier);
    const dismissed = await getDismissedCarrierIds(drv);
    expect(dismissed.has(carrier)).toBe(true);
    expect(dismissed.size).toBe(1);
  });

  it("dismissCarrier is idempotent — second call doesn't error or duplicate", async () => {
    const drv = await seedDriver("idempotent");
    const carrier = await seedCarrier();
    await dismissCarrier(drv, carrier);
    await dismissCarrier(drv, carrier); // would tip UNIQUE if not for onConflictDoNothing
    const dismissed = await getDismissedCarrierIds(drv);
    expect(dismissed.size).toBe(1);
  });

  it("undismissCarrier removes the row; subsequent reads see clean state", async () => {
    const drv = await seedDriver("undismiss");
    const carrier = await seedCarrier();
    await dismissCarrier(drv, carrier);
    expect((await getDismissedCarrierIds(drv)).size).toBe(1);
    await undismissCarrier(drv, carrier);
    expect((await getDismissedCarrierIds(drv)).size).toBe(0);
  });

  it("undismissCarrier on a not-dismissed pair is a no-op (no error)", async () => {
    const drv = await seedDriver("nothing");
    const carrier = await seedCarrier();
    // No prior dismiss.
    await undismissCarrier(drv, carrier);
    expect((await getDismissedCarrierIds(drv)).size).toBe(0);
  });

  it("dismissals are scoped per driver — A's dismissal doesn't affect B", async () => {
    const drvA = await seedDriver("scopeA");
    const drvB = await seedDriver("scopeB");
    const carrier = await seedCarrier();
    await dismissCarrier(drvA, carrier);
    expect((await getDismissedCarrierIds(drvA)).has(carrier)).toBe(true);
    expect((await getDismissedCarrierIds(drvB)).has(carrier)).toBe(false);
  });
});
