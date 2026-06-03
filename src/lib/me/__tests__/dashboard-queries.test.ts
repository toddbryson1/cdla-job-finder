// Integration tests for the /me dashboard queries. Seeds + cleans
// its own sentinel rows so counts are deterministic against the
// seeded state, not the baseline DB.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  driverCarrierApplications,
  driverCarrierMatches,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import {
  getDriverApplicationHistory,
  getNewSinceLastVisit,
  summarizeApplications,
} from "../dashboard-queries";

const SENTINEL_CARRIER = "Me Dashboard Test (sentinel)";
const DRIVER_EMAIL_PREFIX = "me-dashboard-test+";

async function cleanup(): Promise<void> {
  const cs = await db
    .select({ id: carriers.id })
    .from(carriers)
    .where(eq(carriers.name, SENTINEL_CARRIER));
  for (const c of cs) {
    await db
      .delete(partnerApplicationStages)
      .where(eq(partnerApplicationStages.carrierId, c.id));
    await db
      .delete(driverCarrierApplications)
      .where(eq(driverCarrierApplications.carrierId, c.id));
    await db.delete(carrierJobs).where(eq(carrierJobs.carrierId, c.id));
  }
  await db.delete(carriers).where(eq(carriers.name, SENTINEL_CARRIER));
  await db
    .delete(drivers)
    .where(sql`${drivers.email} LIKE ${DRIVER_EMAIL_PREFIX + "%"}`);
}

async function seedCarrierAndJob(): Promise<{
  carrierId: string;
  jobId: string;
}> {
  const [c] = await db
    .insert(carriers)
    .values({
      name: SENTINEL_CARRIER,
      kind: "partner",
      tier: "none",
      status: "active",
    })
    .returning({ id: carriers.id });
  const [j] = await db
    .insert(carrierJobs)
    .values({
      carrierId: c!.id,
      status: "active",
      positionTitle: "Sentinel OTR Reefer",
      domicileCity: "Atlanta",
      domicileState: "GA",
      domicileLat: "33.7488",
      domicileLng: "-84.3877",
      hiringRadiusMiles: 1500,
      equipment: "reefer",
      minExperienceMonths: 12,
      acceptedHomeTimeTypes: ["otr"],
      sapTolerance: "accepts_none",
      applicationSurface: "tenstreet_intelliapp",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
    })
    .returning({ id: carrierJobs.id });
  return { carrierId: c!.id, jobId: j!.id };
}

async function seedDriver(suffix: string): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Dash",
      lastName: `Sentinel${suffix}`,
      email: `${DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
      phone: "555-555-1234",
      homeZip: "30303",
      cdlState: "GA",
      yearsHeld: "3",
      otrYears: "2",
      equipmentRun: ["reefer"],
      desiredEquipment: ["reefer"],
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

describe("getDriverApplicationHistory + summarizeApplications", () => {
  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("returns an empty list + zero stats for a driver with no applications", async () => {
    const driverId = await seedDriver("nobody");
    const rows = await getDriverApplicationHistory(driverId);
    expect(rows).toEqual([]);
    const stats = summarizeApplications(rows);
    expect(stats).toEqual({
      applicationsTotal: 0,
      qualifiedCount: 0,
      notQualifiedCount: 0,
      sterlingConfirmedCount: 0,
      latestApplicationAt: null,
    });
  });

  it("returns applications ordered by most recent consent first", async () => {
    const driverId = await seedDriver("ordering");
    const { carrierId, jobId } = await seedCarrierAndJob();

    // Two apps, second one consented later.
    const olderAt = new Date("2026-06-01T10:00:00Z");
    const newerAt = new Date("2026-06-02T10:00:00Z");

    await db.insert(driverCarrierApplications).values({
      driverId,
      jobId,
      carrierId,
      consentedAt: olderAt,
      consentTextVersion: "v1",
      tcpaOptIn: false,
    });

    // Need a distinct job for the second application — UNIQUE
    // constraint on (driver_id, job_id).
    const { jobId: jobId2 } = await seedCarrierAndJob();
    await db.insert(driverCarrierApplications).values({
      driverId,
      jobId: jobId2,
      carrierId,
      consentedAt: newerAt,
      consentTextVersion: "v1",
      tcpaOptIn: false,
    });

    const rows = await getDriverApplicationHistory(driverId);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.consentedAt.getTime()).toBe(newerAt.getTime());
    expect(rows[1]!.consentedAt.getTime()).toBe(olderAt.getTime());
  });

  it("populates partner-stage + Sterling fields when stage row exists", async () => {
    const driverId = await seedDriver("partner");
    const { carrierId, jobId } = await seedCarrierAndJob();

    await db.insert(driverCarrierApplications).values({
      driverId,
      jobId,
      carrierId,
      consentTextVersion: "v1",
      tcpaOptIn: false,
      lastQualified: true,
    });
    const confirmedAt = new Date("2026-06-02T14:00:00Z");
    await db.insert(partnerApplicationStages).values({
      driverId,
      carrierJobId: jobId,
      carrierId,
      stage: "submitted_to_sterling",
      quickbasePushAttempts: 1,
      quickbaseRecordId: "QB-SENTINEL-42",
      quickbasePushSucceededAt: confirmedAt,
    });

    const rows = await getDriverApplicationHistory(driverId);
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.partnerStage).toBe("submitted_to_sterling");
    expect(r.sterlingRecordId).toBe("QB-SENTINEL-42");
    expect(r.sterlingConfirmedAt?.getTime()).toBe(confirmedAt.getTime());
    expect(r.lastQualified).toBe(true);
  });

  it("leaves partner fields null for non-partner carriers", async () => {
    const driverId = await seedDriver("nonpartner");
    const { carrierId, jobId } = await seedCarrierAndJob();
    await db.insert(driverCarrierApplications).values({
      driverId,
      jobId,
      carrierId,
      consentTextVersion: "v1",
      tcpaOptIn: false,
      lastQualified: false,
    });
    const rows = await getDriverApplicationHistory(driverId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.partnerStage).toBeNull();
    expect(rows[0]!.sterlingRecordId).toBeNull();
    expect(rows[0]!.sterlingConfirmedAt).toBeNull();
    expect(rows[0]!.lastQualified).toBe(false);
  });

  it("summarizeApplications counts qualified / not-qualified / Sterling-confirmed correctly", async () => {
    const driverId = await seedDriver("stats");
    const { carrierId, jobId: j1 } = await seedCarrierAndJob();
    const { jobId: j2 } = await seedCarrierAndJob();
    const { jobId: j3 } = await seedCarrierAndJob();

    // Three apps: 1 qualified + Sterling, 1 qualified no-Sterling, 1
    // not-qualified.
    await db.insert(driverCarrierApplications).values([
      {
        driverId,
        jobId: j1,
        carrierId,
        consentTextVersion: "v1",
        tcpaOptIn: false,
        lastQualified: true,
      },
      {
        driverId,
        jobId: j2,
        carrierId,
        consentTextVersion: "v1",
        tcpaOptIn: false,
        lastQualified: true,
      },
      {
        driverId,
        jobId: j3,
        carrierId,
        consentTextVersion: "v1",
        tcpaOptIn: false,
        lastQualified: false,
      },
    ]);
    await db.insert(partnerApplicationStages).values({
      driverId,
      carrierJobId: j1,
      carrierId,
      stage: "submitted_to_sterling",
      quickbasePushAttempts: 1,
      quickbaseRecordId: "QB-1",
      quickbasePushSucceededAt: new Date(),
    });

    const rows = await getDriverApplicationHistory(driverId);
    const stats = summarizeApplications(rows);
    expect(stats.applicationsTotal).toBe(3);
    expect(stats.qualifiedCount).toBe(2);
    expect(stats.notQualifiedCount).toBe(1);
    expect(stats.sterlingConfirmedCount).toBe(1);
    expect(stats.latestApplicationAt).not.toBeNull();
  });
});

describe("getNewSinceLastVisit", () => {
  // Shares the same sentinel cleanup as the block above. Re-declare
  // helpers locally so the test file stays scannable when read in
  // isolation.
  const SINCE_DRIVER_EMAIL_PREFIX = "since-test+";
  const SINCE_SENTINEL_CARRIER = "Since Visit Test (sentinel)";

  async function cleanup(): Promise<void> {
    const cs = await db
      .select({ id: carriers.id })
      .from(carriers)
      .where(eq(carriers.name, SINCE_SENTINEL_CARRIER));
    for (const c of cs) {
      await db
        .delete(partnerApplicationStages)
        .where(eq(partnerApplicationStages.carrierId, c.id));
      await db
        .delete(driverCarrierMatches)
        .where(eq(driverCarrierMatches.carrierId, c.id));
      await db
        .delete(driverCarrierApplications)
        .where(eq(driverCarrierApplications.carrierId, c.id));
      await db.delete(carrierJobs).where(eq(carrierJobs.carrierId, c.id));
    }
    await db.delete(carriers).where(eq(carriers.name, SINCE_SENTINEL_CARRIER));
    await db
      .delete(drivers)
      .where(sql`${drivers.email} LIKE ${SINCE_DRIVER_EMAIL_PREFIX + "%"}`);
  }

  async function seedDriver(suffix: string): Promise<string> {
    const [row] = await db
      .insert(drivers)
      .values({
        firstName: "Since",
        lastName: `Sentinel${suffix}`,
        email: `${SINCE_DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
        phone: "555-555-1234",
        homeZip: "30303",
        cdlState: "GA",
        yearsHeld: "3",
        otrYears: "2",
        equipmentRun: ["reefer"],
        desiredEquipment: ["reefer"],
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

  async function seedCarrierAndJob(): Promise<{
    carrierId: string;
    jobId: string;
  }> {
    const [c] = await db
      .insert(carriers)
      .values({
        name: SINCE_SENTINEL_CARRIER,
        kind: "partner",
        tier: "none",
        status: "active",
      })
      .returning({ id: carriers.id });
    const [j] = await db
      .insert(carrierJobs)
      .values({
        carrierId: c!.id,
        status: "active",
        positionTitle: "Sentinel",
        domicileCity: "Atlanta",
        domicileState: "GA",
        domicileLat: "33.7488",
        domicileLng: "-84.3877",
        hiringRadiusMiles: 1500,
        equipment: "reefer",
        minExperienceMonths: 6,
        acceptedHomeTimeTypes: ["otr"],
        sapTolerance: "accepts_none",
        applicationSurface: "tenstreet_intelliapp",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
      })
      .returning({ id: carrierJobs.id });
    return { carrierId: c!.id, jobId: j!.id };
  }

  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("returns null when previousSeenAt is null (first visit)", async () => {
    const driverId = await seedDriver("firstvisit");
    const r = await getNewSinceLastVisit(driverId, null);
    expect(r).toBeNull();
  });

  it("counts driver_carrier_matches rows with matchedAt > previousSeenAt", async () => {
    const driverId = await seedDriver("matches");
    const { carrierId, jobId } = await seedCarrierAndJob();
    const { jobId: jobId2 } = await seedCarrierAndJob();

    const cutoff = new Date("2026-06-01T12:00:00Z");
    const before = new Date("2026-05-31T12:00:00Z");
    const after = new Date("2026-06-02T12:00:00Z");

    await db.insert(driverCarrierMatches).values([
      {
        driverId,
        jobId,
        carrierId,
        matchedAt: before,
        softRankScore: "1",
      },
      {
        driverId,
        jobId: jobId2,
        carrierId,
        matchedAt: after,
        softRankScore: "1",
      },
    ]);

    const r = await getNewSinceLastVisit(driverId, cutoff);
    expect(r).not.toBeNull();
    expect(r!.newMatches).toBe(1);
    expect(r!.newSterlingConfirmations).toBe(0);
    expect(r!.since.getTime()).toBe(cutoff.getTime());
  });

  it("counts Sterling confirmations whose quickbase_push_succeeded_at > previousSeenAt", async () => {
    const driverId = await seedDriver("sterling");
    const { carrierId, jobId } = await seedCarrierAndJob();
    const cutoff = new Date("2026-06-01T12:00:00Z");
    await db.insert(partnerApplicationStages).values({
      driverId,
      carrierJobId: jobId,
      carrierId,
      stage: "submitted_to_sterling",
      quickbasePushAttempts: 1,
      quickbaseRecordId: "QB-NEW",
      quickbasePushSucceededAt: new Date("2026-06-02T10:00:00Z"),
    });
    const r = await getNewSinceLastVisit(driverId, cutoff);
    expect(r).not.toBeNull();
    expect(r!.newSterlingConfirmations).toBe(1);
  });

  it("doesn't count Sterling confirmations whose quickbase_push_succeeded_at is at-or-before previousSeenAt", async () => {
    const driverId = await seedDriver("oldsterling");
    const { carrierId, jobId } = await seedCarrierAndJob();
    const cutoff = new Date("2026-06-02T12:00:00Z");
    await db.insert(partnerApplicationStages).values({
      driverId,
      carrierJobId: jobId,
      carrierId,
      stage: "submitted_to_sterling",
      quickbasePushAttempts: 1,
      quickbaseRecordId: "QB-OLD",
      quickbasePushSucceededAt: new Date("2026-06-01T10:00:00Z"),
    });
    const r = await getNewSinceLastVisit(driverId, cutoff);
    expect(r).not.toBeNull();
    expect(r!.newSterlingConfirmations).toBe(0);
  });

  it("returns 0/0 when there's no activity since previousSeenAt", async () => {
    const driverId = await seedDriver("quiet");
    const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
    const r = await getNewSinceLastVisit(driverId, cutoff);
    expect(r).not.toBeNull();
    expect(r!.newMatches).toBe(0);
    expect(r!.newSterlingConfirmations).toBe(0);
  });
});
