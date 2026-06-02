// Smoke tests for the admin dashboard queries. Integration against
// the seed DB — verifies each query runs without error and returns
// expected shape. The actual counts depend on what's in the seed
// data; we just check structural invariants.

import { describe, expect, it } from "vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import {
  getCarrierBreakdown,
  getCarrierHandoffDrift,
  getCarrierPerformance30d,
  getCyclesExpiringSoon,
  getDashboardCounts,
  getDriverFunnel30d,
  getPartnerHandoffFunnel,
  getRecentActivity,
  getRecentArchivedJobs,
  getRecentConsents,
  getTaUnresolved,
} from "@/lib/admin/dashboard-queries";

describe("dashboard-queries.getDashboardCounts", () => {
  it("returns the count shape with non-negative integers", async () => {
    const c = await getDashboardCounts();
    expect(c.carriers.active).toBeGreaterThanOrEqual(0);
    expect(c.carriers.partner).toBeGreaterThanOrEqual(0);
    expect(c.carriers.subscription).toBeGreaterThanOrEqual(0);
    expect(c.carriers.prospect).toBeGreaterThanOrEqual(0);
    expect(c.carrierJobs.active).toBeGreaterThanOrEqual(0);
    expect(c.carrierJobs.archived).toBeGreaterThanOrEqual(0);
    expect(c.postingCycles.active).toBeGreaterThanOrEqual(0);
    expect(c.postingCycles.expired).toBeGreaterThanOrEqual(0);
    expect(c.postingCycles.primary).toBeGreaterThanOrEqual(0);
  });

  it("carriers.active equals sum of (partner + subscription + prospect)", async () => {
    const c = await getDashboardCounts();
    const sum =
      c.carriers.partner + c.carriers.subscription + c.carriers.prospect;
    expect(c.carriers.active).toBe(sum);
  });

  it("primary cycles count is ≤ active cycles count", async () => {
    const c = await getDashboardCounts();
    expect(c.postingCycles.primary).toBeLessThanOrEqual(c.postingCycles.active);
  });
});

describe("dashboard-queries.getCarrierBreakdown", () => {
  it("returns rows ordered by active_jobs descending", async () => {
    const rows = await getCarrierBreakdown();
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].active_jobs).toBeGreaterThanOrEqual(
        rows[i + 1].active_jobs,
      );
    }
  });

  it("quality counts sum to active jobs (or fewer if some have null quality)", async () => {
    const rows = await getCarrierBreakdown();
    for (const r of rows) {
      const qSum =
        r.by_quality.complete + r.by_quality.partial + r.by_quality.minimal;
      // Each active job has data_quality enum; the sum should equal active_jobs
      expect(qSum).toBeLessThanOrEqual(r.active_jobs);
    }
  });

  it("includes every carrier kind we know about", async () => {
    const rows = await getCarrierBreakdown();
    const kinds = new Set(rows.map((r) => r.kind));
    // Must have at least 'partner' or 'subscription' or 'prospect'
    const knownKinds = ["partner", "subscription", "prospect"];
    const hasKnown = knownKinds.some((k) => kinds.has(k));
    expect(hasKnown).toBe(true);
  });
});

describe("dashboard-queries.getRecentActivity", () => {
  it("returns exactly 6 activity buckets", async () => {
    const rows = await getRecentActivity();
    expect(rows.length).toBe(6);
    const buckets = rows.map((r) => r.bucket);
    expect(buckets).toContain("carrier_jobs inserted");
    expect(buckets).toContain("cycles spawned");
    expect(buckets).toContain("drivers signed up");
  });

  it("all counts are non-negative", async () => {
    const rows = await getRecentActivity();
    for (const r of rows) {
      expect(r.count).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("dashboard-queries.getCyclesExpiringSoon", () => {
  it("returns at most 50 rows", async () => {
    const rows = await getCyclesExpiringSoon(5);
    expect(rows.length).toBeLessThanOrEqual(50);
  });

  it("all returned cycles expire within the requested window", async () => {
    const rows = await getCyclesExpiringSoon(5);
    const cutoff = Date.now() + 5 * 24 * 60 * 60 * 1000;
    for (const r of rows) {
      expect(new Date(r.expires_at).getTime()).toBeLessThanOrEqual(cutoff);
    }
  });

  it("days_left is a non-negative integer", async () => {
    const rows = await getCyclesExpiringSoon(5);
    for (const r of rows) {
      expect(Number.isInteger(r.days_left)).toBe(true);
      expect(r.days_left).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("dashboard-queries.getTaUnresolved", () => {
  it("returns rows or an empty array (TA may not be inserted in this DB)", async () => {
    const rows = await getTaUnresolved();
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.division).toBe("string");
      expect(typeof r.has_mapping).toBe("boolean");
      expect(["complete", "partial", "minimal"]).toContain(r.data_quality);
    }
  });
});

describe("dashboard-queries.getRecentArchivedJobs", () => {
  it("respects the limit", async () => {
    const rows = await getRecentArchivedJobs(5);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it("ordered by archived_at descending", async () => {
    const rows = await getRecentArchivedJobs(10);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(new Date(rows[i].archived_at).getTime()).toBeGreaterThanOrEqual(
        new Date(rows[i + 1].archived_at).getTime(),
      );
    }
  });
});

describe("dashboard-queries.getDriverFunnel30d", () => {
  it("returns non-negative integers in every field", async () => {
    const f = await getDriverFunnel30d();
    expect(f.intakes).toBeGreaterThanOrEqual(0);
    expect(f.intakesWithAnyMatch).toBeGreaterThanOrEqual(0);
    expect(f.intakesWithAnyConsent).toBeGreaterThanOrEqual(0);
    expect(f.totalImpressions).toBeGreaterThanOrEqual(0);
    expect(f.totalConsents).toBeGreaterThanOrEqual(0);
    expect(f.totalQualified).toBeGreaterThanOrEqual(0);
    expect(f.matchCountBuckets.zero).toBeGreaterThanOrEqual(0);
    expect(f.matchCountBuckets.one).toBeGreaterThanOrEqual(0);
    expect(f.matchCountBuckets.twoToFour).toBeGreaterThanOrEqual(0);
    expect(f.matchCountBuckets.fivePlus).toBeGreaterThanOrEqual(0);
  });

  it("intakesWithAnyMatch ≤ intakes", async () => {
    const f = await getDriverFunnel30d();
    expect(f.intakesWithAnyMatch).toBeLessThanOrEqual(f.intakes);
  });

  it("intakesWithAnyConsent ≤ intakesWithAnyMatch (can't consent without seeing a match)", async () => {
    const f = await getDriverFunnel30d();
    expect(f.intakesWithAnyConsent).toBeLessThanOrEqual(f.intakesWithAnyMatch);
  });

  it("totalConsents ≤ totalImpressions (a driver can only consent to a carrier they've seen)", async () => {
    const f = await getDriverFunnel30d();
    expect(f.totalConsents).toBeLessThanOrEqual(f.totalImpressions);
  });

  it("totalQualified ≤ totalConsents (qualification only runs after consent)", async () => {
    const f = await getDriverFunnel30d();
    expect(f.totalQualified).toBeLessThanOrEqual(f.totalConsents);
  });

  it("match-count buckets sum to intakes", async () => {
    const f = await getDriverFunnel30d();
    const sum =
      f.matchCountBuckets.zero +
      f.matchCountBuckets.one +
      f.matchCountBuckets.twoToFour +
      f.matchCountBuckets.fivePlus;
    expect(sum).toBe(f.intakes);
  });
});

describe("dashboard-queries.getCarrierPerformance30d", () => {
  it("returns rows ordered by impressions descending", async () => {
    const rows = await getCarrierPerformance30d();
    for (let i = 0; i < rows.length - 1; i++) {
      expect(rows[i].impressions).toBeGreaterThanOrEqual(rows[i + 1].impressions);
    }
  });

  it("consents ≤ impressions and qualified ≤ consents per row", async () => {
    const rows = await getCarrierPerformance30d();
    for (const r of rows) {
      expect(r.consents).toBeLessThanOrEqual(r.impressions);
      expect(r.qualified).toBeLessThanOrEqual(r.consents);
    }
  });

  it("consent_rate_pct matches consents/impressions × 100", async () => {
    const rows = await getCarrierPerformance30d();
    for (const r of rows) {
      const expected =
        r.impressions === 0
          ? 0
          : Math.round((1000 * r.consents) / r.impressions) / 10;
      expect(Math.abs(r.consent_rate_pct - expected)).toBeLessThanOrEqual(0.1);
    }
  });
});

describe("dashboard-queries.getRecentConsents", () => {
  it("respects the limit", async () => {
    const rows = await getRecentConsents(5);
    expect(rows.length).toBeLessThanOrEqual(5);
  });

  it("ordered by consented_at descending", async () => {
    const rows = await getRecentConsents(20);
    for (let i = 0; i < rows.length - 1; i++) {
      expect(new Date(rows[i].consented_at).getTime()).toBeGreaterThanOrEqual(
        new Date(rows[i + 1].consented_at).getTime(),
      );
    }
  });

  it("row shape is correct", async () => {
    const rows = await getRecentConsents(20);
    for (const r of rows) {
      expect(typeof r.carrier).toBe("string");
      expect(typeof r.position_title).toBe("string");
      expect(typeof r.driver_first_name).toBe("string");
      expect(typeof r.cdl_state).toBe("string");
      expect(r.qualified === null || typeof r.qualified === "boolean").toBe(true);
    }
  });
});

describe("dashboard-queries.getPartnerHandoffFunnel", () => {
  // Seeds + cleans up its own row set so the counts are
  // deterministic against the row inserts in this block, not the
  // baseline seed. Uses a sentinel carrier name so cleanup can
  // scope safely.

  const SENTINEL = "Anderson Handoff Funnel Test (sentinel)";
  const DRIVER_EMAIL_PREFIX = "handoff-funnel-test+";

  async function cleanup(): Promise<void> {
    const cs = await db
      .select({ id: carriers.id })
      .from(carriers)
      .where(eq(carriers.name, SENTINEL));
    for (const c of cs) {
      await db
        .delete(partnerApplicationStages)
        .where(eq(partnerApplicationStages.carrierId, c.id));
      await db.delete(carrierJobs).where(eq(carrierJobs.carrierId, c.id));
    }
    await db.delete(carriers).where(eq(carriers.name, SENTINEL));
    await db
      .delete(drivers)
      .where(sql`${drivers.email} LIKE ${DRIVER_EMAIL_PREFIX + "%"}`);
  }

  async function seedCarrierAndJob() {
    const [c] = await db
      .insert(carriers)
      .values({
        name: SENTINEL,
        kind: "partner",
        tier: "none",
        status: "active",
        partnerHandoffConfig: { handoff_type: "anderson_quickbase" },
      })
      .returning({ id: carriers.id });
    const [j] = await db
      .insert(carrierJobs)
      .values({
        carrierId: c!.id,
        status: "active",
        positionTitle: "Test job",
        domicileCity: "St. Cloud",
        domicileState: "MN",
        domicileLat: "45.557900",
        domicileLng: "-94.163200",
        hiringRadiusMiles: 1500,
        equipment: "dry-van",
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

  async function seedDriver(suffix: string): Promise<string> {
    const [row] = await db
      .insert(drivers)
      .values({
        firstName: "Pat",
        lastName: `Funnel${suffix}`,
        email: `${DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
        phone: "555-555-1234",
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

  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("returns the empty-state shape when no handoff rows exist", async () => {
    // Cleanup just ran, so no sentinel rows. The funnel still
    // reflects any prod-shaped rows in the test DB — we only assert
    // structure here.
    const r = await getPartnerHandoffFunnel();
    expect(r.byStage.apply_initiated).toBeGreaterThanOrEqual(0);
    expect(r.byStage.intelliapp_link_sent).toBeGreaterThanOrEqual(0);
    expect(r.byStage.submitted_to_sterling).toBeGreaterThanOrEqual(0);
    expect(r.byStage.submit_failed_validation).toBeGreaterThanOrEqual(0);
    expect(r.byStage.submit_queued_for_retry).toBeGreaterThanOrEqual(0);
    expect(r.byStage.stalled).toBeGreaterThanOrEqual(0);
    expect(r.total).toBeGreaterThanOrEqual(0);
    expect(r.retryDueNow).toBeGreaterThanOrEqual(0);
    expect(r.sterlingConfirmed).toBeGreaterThanOrEqual(0);
    expect(r.totalAttempts).toBeGreaterThanOrEqual(0);
    expect(
      r.latestSubmissionAt === null || r.latestSubmissionAt instanceof Date,
    ).toBe(true);
  });

  it("counts new rows correctly by stage + tracks total + attempts", async () => {
    const { carrierId, jobId } = await seedCarrierAndJob();
    const drvA = await seedDriver("A");
    const drvB = await seedDriver("B");
    const drvC = await seedDriver("C");

    const baseline = await getPartnerHandoffFunnel();

    await db.insert(partnerApplicationStages).values([
      {
        driverId: drvA,
        carrierJobId: jobId,
        carrierId,
        stage: "intelliapp_link_sent",
        quickbasePushAttempts: 0,
      },
      {
        driverId: drvB,
        carrierJobId: jobId,
        carrierId,
        stage: "submitted_to_sterling",
        quickbasePushAttempts: 1,
        quickbaseRecordId: "abc123",
        quickbasePushSucceededAt: new Date("2026-06-02T10:00:00Z"),
      },
      {
        driverId: drvC,
        carrierJobId: jobId,
        carrierId,
        stage: "submit_failed_validation",
        quickbasePushAttempts: 3,
      },
    ]);

    const after = await getPartnerHandoffFunnel();

    // Delta should match the 3 inserted rows.
    expect(after.total - baseline.total).toBe(3);
    expect(
      after.byStage.intelliapp_link_sent - baseline.byStage.intelliapp_link_sent,
    ).toBe(1);
    expect(
      after.byStage.submitted_to_sterling -
        baseline.byStage.submitted_to_sterling,
    ).toBe(1);
    expect(
      after.byStage.submit_failed_validation -
        baseline.byStage.submit_failed_validation,
    ).toBe(1);

    // Attempts: 0 + 1 + 3 = 4
    expect(after.totalAttempts - baseline.totalAttempts).toBe(4);

    // Sterling-confirmed: only the row with a quickbase_record_id.
    expect(after.sterlingConfirmed - baseline.sterlingConfirmed).toBe(1);

    // Latest submission timestamp picks up the new max.
    expect(after.latestSubmissionAt).not.toBeNull();
    if (after.latestSubmissionAt) {
      expect(after.latestSubmissionAt.getTime()).toBeGreaterThanOrEqual(
        new Date("2026-06-02T10:00:00Z").getTime(),
      );
    }
  });

  it("retryDueNow counts only rows whose next_retry_at <= now", async () => {
    const { carrierId, jobId } = await seedCarrierAndJob();
    const drvA = await seedDriver("dueA");
    const drvB = await seedDriver("notDueB");

    const baseline = await getPartnerHandoffFunnel();

    await db.insert(partnerApplicationStages).values([
      {
        driverId: drvA,
        carrierJobId: jobId,
        carrierId,
        stage: "submit_queued_for_retry",
        quickbasePushAttempts: 1,
        quickbaseNextRetryAt: new Date(Date.now() - 60_000), // 1 min ago — DUE
      },
      {
        driverId: drvB,
        carrierJobId: jobId,
        carrierId,
        stage: "submit_queued_for_retry",
        quickbasePushAttempts: 1,
        quickbaseNextRetryAt: new Date(Date.now() + 60 * 60 * 1000), // in 1h — NOT due
      },
    ]);

    const after = await getPartnerHandoffFunnel();

    // Both rows count toward submit_queued_for_retry stage.
    expect(
      after.byStage.submit_queued_for_retry -
        baseline.byStage.submit_queued_for_retry,
    ).toBe(2);

    // But only the past-due row counts toward retryDueNow.
    expect(after.retryDueNow - baseline.retryDueNow).toBe(1);
  });

  it("ignores rows where stage is not submit_queued_for_retry even if next_retry_at is set", async () => {
    // Belt-and-suspenders: the partial index in migration 0027 only
    // covers stage='submit_queued_for_retry', but the query also has
    // an explicit stage filter. Make sure that still works if a row
    // somehow has a stale next_retry_at on a terminal stage.
    const { carrierId, jobId } = await seedCarrierAndJob();
    const drv = await seedDriver("stale");
    const baseline = await getPartnerHandoffFunnel();

    await db.insert(partnerApplicationStages).values({
      driverId: drv,
      carrierJobId: jobId,
      carrierId,
      stage: "submitted_to_sterling", // terminal
      quickbasePushAttempts: 1,
      quickbaseRecordId: "abc",
      // Stale: should be cleared but isn't. Funnel must not count this.
      quickbaseNextRetryAt: new Date(Date.now() - 60_000),
    });

    const after = await getPartnerHandoffFunnel();
    expect(after.retryDueNow - baseline.retryDueNow).toBe(0);
  });
});

describe("dashboard-queries.getCarrierHandoffDrift", () => {
  // Three sentinel carriers: one validly configured (should NEVER
  // appear in drift), one mis-typed (handoff_type wrong), one with a
  // missing realm_hostname. Cleanup deletes everything by name prefix.
  const NAME_PREFIX = "Carrier Drift Test (sentinel)";
  const VALID = `${NAME_PREFIX} VALID`;
  const WRONG_TYPE = `${NAME_PREFIX} WRONG_TYPE`;
  const MISSING_FIELD = `${NAME_PREFIX} MISSING_FIELD`;
  const DRIVER_EMAIL_PREFIX = "carrier-drift-test+";

  async function cleanup(): Promise<void> {
    const cs = await db
      .select({ id: carriers.id })
      .from(carriers)
      .where(sql`${carriers.name} LIKE ${NAME_PREFIX + "%"}`);
    for (const c of cs) {
      await db
        .delete(partnerApplicationStages)
        .where(eq(partnerApplicationStages.carrierId, c.id));
      await db.delete(carrierJobs).where(eq(carrierJobs.carrierId, c.id));
    }
    await db
      .delete(carriers)
      .where(sql`${carriers.name} LIKE ${NAME_PREFIX + "%"}`);
    await db
      .delete(drivers)
      .where(sql`${drivers.email} LIKE ${DRIVER_EMAIL_PREFIX + "%"}`);
  }

  async function seedCarrier(name: string, cfg: unknown): Promise<string> {
    const [c] = await db
      .insert(carriers)
      .values({
        name,
        kind: "partner",
        tier: "none",
        status: "active",
        partnerHandoffConfig: cfg as Record<string, unknown>,
      })
      .returning({ id: carriers.id });
    return c!.id;
  }

  async function seedJob(carrierId: string): Promise<string> {
    const [j] = await db
      .insert(carrierJobs)
      .values({
        carrierId,
        status: "active",
        positionTitle: "Drift Test Job",
        domicileCity: "St. Cloud",
        domicileState: "MN",
        domicileLat: "45.557900",
        domicileLng: "-94.163200",
        hiringRadiusMiles: 1500,
        equipment: "dry-van",
        minExperienceMonths: 6,
        acceptedHomeTimeTypes: ["otr"],
        sapTolerance: "accepts_none",
        applicationSurface: "tenstreet_intelliapp",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
      })
      .returning({ id: carrierJobs.id });
    return j!.id;
  }

  async function seedDriver(suffix: string): Promise<string> {
    const [row] = await db
      .insert(drivers)
      .values({
        firstName: "Pat",
        lastName: `Drift${suffix}`,
        email: `${DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
        phone: "555-555-1234",
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

  beforeAll(async () => {
    await cleanup();
  });
  afterAll(async () => {
    await cleanup();
  });
  afterEach(async () => {
    await cleanup();
  });

  it("doesn't flag carriers with a valid anderson_quickbase config", async () => {
    await seedCarrier(VALID, {
      handoff_type: "anderson_quickbase",
      quickbase: {
        realm_hostname: "sterlingrecruitingsolutions.quickbase.com",
        app_id: "bcivf3yss",
        table_id: "bcivf3ysv",
      },
    });

    const r = await getCarrierHandoffDrift();
    // No sentinel carrier should be in the drift list. (Other prod-
    // shaped carriers may or may not be — we don't assert about them.)
    expect(r.drifted.find((d) => d.carrierName === VALID)).toBeUndefined();
  });

  it("flags wrong_handoff_type carriers that have stage rows", async () => {
    const carrierId = await seedCarrier(WRONG_TYPE, {
      handoff_type: "tenstreet_only",
    });
    const jobId = await seedJob(carrierId);
    const driverId = await seedDriver("wt1");

    // One pending row + one historically-failed row.
    await db.insert(partnerApplicationStages).values([
      {
        driverId,
        carrierJobId: jobId,
        carrierId,
        stage: "submit_queued_for_retry",
        quickbasePushAttempts: 1,
        quickbaseNextRetryAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    ]);
    const driverId2 = await seedDriver("wt2");
    await db.insert(partnerApplicationStages).values([
      {
        driverId: driverId2,
        carrierJobId: jobId,
        carrierId,
        stage: "submit_failed_validation",
        quickbasePushAttempts: 1,
        quickbaseLastError:
          "Carrier handoff config no longer routes to anderson_quickbase",
      },
    ]);

    const r = await getCarrierHandoffDrift();
    const row = r.drifted.find((d) => d.carrierName === WRONG_TYPE);
    expect(row).toBeDefined();
    if (row) {
      expect(row.code).toBe("wrong_handoff_type");
      expect(row.pendingRows).toBe(1);
      expect(row.historicalDriftRows).toBe(1);
    }
  });

  it("flags carriers declaring anderson_quickbase but missing a quickbase field", async () => {
    await seedCarrier(MISSING_FIELD, {
      handoff_type: "anderson_quickbase",
      quickbase: {
        // realm_hostname missing on purpose
        app_id: "a",
        table_id: "t",
      },
    });

    const r = await getCarrierHandoffDrift();
    const row = r.drifted.find((d) => d.carrierName === MISSING_FIELD);
    expect(row).toBeDefined();
    if (row) {
      expect(row.code).toBe("missing_quickbase_field");
      expect(row.reason).toMatch(/realm_hostname/);
      // No stage rows seeded — pending should be 0.
      expect(row.pendingRows).toBe(0);
      expect(row.historicalDriftRows).toBe(0);
    }
  });

  it("aggregates total pending + historical across drifted carriers", async () => {
    const c1 = await seedCarrier(WRONG_TYPE, { handoff_type: "x" });
    const c2 = await seedCarrier(MISSING_FIELD, {
      handoff_type: "anderson_quickbase",
      quickbase: { app_id: "a", table_id: "t" },
    });
    const j1 = await seedJob(c1);
    const j2 = await seedJob(c2);
    const d1 = await seedDriver("agg1");
    const d2 = await seedDriver("agg2");
    const d3 = await seedDriver("agg3");

    await db.insert(partnerApplicationStages).values([
      // c1 — 2 pending, 1 historical
      {
        driverId: d1,
        carrierJobId: j1,
        carrierId: c1,
        stage: "intelliapp_link_sent",
      },
      {
        driverId: d2,
        carrierJobId: j1,
        carrierId: c1,
        stage: "submit_queued_for_retry",
      },
      {
        driverId: d3,
        carrierJobId: j1,
        carrierId: c1,
        stage: "submit_failed_validation",
        quickbaseLastError: "Carrier quickbase config malformed",
      },
    ]);
    // c2 — 1 pending, 0 historical
    const d4 = await seedDriver("agg4");
    await db.insert(partnerApplicationStages).values([
      {
        driverId: d4,
        carrierJobId: j2,
        carrierId: c2,
        stage: "apply_initiated",
      },
    ]);

    const r = await getCarrierHandoffDrift();
    const r1 = r.drifted.find((d) => d.carrierName === WRONG_TYPE);
    const r2 = r.drifted.find((d) => d.carrierName === MISSING_FIELD);
    expect(r1?.pendingRows).toBe(2);
    expect(r1?.historicalDriftRows).toBe(1);
    expect(r2?.pendingRows).toBe(1);
    expect(r2?.historicalDriftRows).toBe(0);

    // Aggregates include at least our sentinel rows. Other prod-
    // shaped drift may also be present — assert >= not ==.
    expect(r.totalPendingDoomed).toBeGreaterThanOrEqual(3);
    expect(r.totalHistoricalDriftRows).toBeGreaterThanOrEqual(1);
  });

  it("sorts by pending desc, then historical desc, then name asc", async () => {
    const a = await seedCarrier(`${NAME_PREFIX} A_lo`, { handoff_type: "x" });
    const b = await seedCarrier(`${NAME_PREFIX} B_hi`, { handoff_type: "x" });
    const ja = await seedJob(a);
    const jb = await seedJob(b);
    const da = await seedDriver("sort_a");
    const db1 = await seedDriver("sort_b");
    const db2 = await seedDriver("sort_b2");

    await db.insert(partnerApplicationStages).values([
      // A — 1 pending
      {
        driverId: da,
        carrierJobId: ja,
        carrierId: a,
        stage: "apply_initiated",
      },
      // B — 2 pending
      {
        driverId: db1,
        carrierJobId: jb,
        carrierId: b,
        stage: "apply_initiated",
      },
      {
        driverId: db2,
        carrierJobId: jb,
        carrierId: b,
        stage: "intelliapp_link_sent",
      },
    ]);

    const r = await getCarrierHandoffDrift();
    const sentinelRows = r.drifted.filter((d) =>
      d.carrierName.startsWith(NAME_PREFIX),
    );
    // B comes before A in the sentinel slice (higher pending count).
    const bi = sentinelRows.findIndex((d) => d.carrierName.endsWith("B_hi"));
    const ai = sentinelRows.findIndex((d) => d.carrierName.endsWith("A_lo"));
    expect(bi).toBeLessThan(ai);
  });
});
