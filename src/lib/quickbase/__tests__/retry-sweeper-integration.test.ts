// Integration tests for the QuickBase retry sweeper. Seeds a real
// Anderson-shaped carrier + job + driver + queued stage row, mocks
// fetch, and exercises runQbRetrySweeper across the meaningful
// outcomes per spec §B6.3:
//
//   - Flag off → no-op (rows stay queued)
//   - Not-yet-due row → skipped (sweeper picks only rows where
//     next_retry_at <= now)
//   - Due row + 2xx → stage flips to submitted_to_sterling,
//     next_retry_at cleared, recordId stored
//   - Due row + 5xx with budget left → stage stays queued,
//     attempts++, next_retry_at advances to next backoff bucket
//   - Due row + 5xx at attempt 5 → exhausted → stage flips to
//     submit_failed_validation with "max retries exhausted"
//   - Due row + 4xx → stage flips to submit_failed_validation
//   - Due row whose carrier is no longer routed to anderson_quickbase
//     → stage flips to submit_failed_validation (no infinite loop)

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import { runQbRetrySweeper } from "@/lib/quickbase/retry-sweeper";

const TEST_CARRIER_NAME = "Anderson Trucking Service (sweeper test)";
const TEST_DRIVER_EMAIL_PREFIX = "anderson-qb-sweeper+";

const ANDERSON_QB_CONFIG = {
  handoff_type: "anderson_quickbase",
  intelliapp_url: "https://intelliapp.example/c/anderson",
  quickbase: {
    realm_hostname: "sterling.example.com",
    app_id: "test_app",
    table_id: "test_table",
    default_recruiter_name: "Test Recruiter",
  },
};

async function cleanup(): Promise<void> {
  const cs = await db
    .select({ id: carriers.id })
    .from(carriers)
    .where(eq(carriers.name, TEST_CARRIER_NAME));
  for (const c of cs) {
    await db
      .delete(partnerApplicationStages)
      .where(eq(partnerApplicationStages.carrierId, c.id));
    await db.delete(carrierJobs).where(eq(carrierJobs.carrierId, c.id));
  }
  await db.delete(carriers).where(eq(carriers.name, TEST_CARRIER_NAME));
  await db
    .delete(drivers)
    .where(sql`${drivers.email} LIKE ${TEST_DRIVER_EMAIL_PREFIX + "%"}`);
}

async function seedCarrierAndJob(
  handoffConfig: Record<string, unknown> | null = ANDERSON_QB_CONFIG,
): Promise<{ carrierId: string; jobId: string }> {
  const [carrier] = await db
    .insert(carriers)
    .values({
      name: TEST_CARRIER_NAME,
      kind: "partner",
      tier: "none",
      status: "active",
      partnerHandoffConfig: handoffConfig,
    })
    .returning({ id: carriers.id });
  if (!carrier) throw new Error("Failed to seed carrier");

  const [job] = await db
    .insert(carrierJobs)
    .values({
      carrierId: carrier.id,
      status: "active",
      positionTitle: "Lease Purchase Van - OTR",
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
  if (!job) throw new Error("Failed to seed carrier job");
  return { carrierId: carrier.id, jobId: job.id };
}

async function seedDriver(suffix: string): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Pat",
      lastName: `Sweep${suffix}`,
      email: `${TEST_DRIVER_EMAIL_PREFIX}${suffix}@example.com`,
      phone: "555-555-1234",
      addressStreet: "123 Main St",
      addressCity: "St. Cloud",
      addressState: "MN",
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
  if (!row) throw new Error("Failed to seed driver");
  return row.id;
}

async function seedQueuedStage(input: {
  driverId: string;
  jobId: string;
  carrierId: string;
  attempts: number;
  nextRetryAt: Date | null;
  lastError?: string;
}): Promise<string> {
  const [row] = await db
    .insert(partnerApplicationStages)
    .values({
      driverId: input.driverId,
      carrierJobId: input.jobId,
      carrierId: input.carrierId,
      stage: "submit_queued_for_retry",
      quickbasePushAttempts: input.attempts,
      quickbaseLastError: input.lastError ?? "previous 5xx",
      quickbaseNextRetryAt: input.nextRetryAt,
    })
    .returning({ id: partnerApplicationStages.id });
  if (!row) throw new Error("Failed to seed stage row");
  return row.id;
}

async function getStageRow(id: string) {
  return db.query.partnerApplicationStages.findFirst({
    where: eq(partnerApplicationStages.id, id),
  });
}

beforeAll(async () => {
  await cleanup();
});
afterAll(async () => {
  await cleanup();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await cleanup();
});

describe("runQbRetrySweeper — spec §B6.3 integration", () => {
  it("flag-off → skippedFlagOff=true, no fetch, no DB writes", async () => {
    delete process.env.QUICKBASE_STERLING_API_TOKEN;
    delete process.env.QUICKBASE_PUSH_ENABLED;
    const fetchSpy = vi.spyOn(global, "fetch");

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("flagoff");
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 1,
      nextRetryAt: new Date(Date.now() - 60_000), // due 1 min ago
    });

    const r = await runQbRetrySweeper();
    expect(r.skippedFlagOff).toBe(true);
    expect(r.attempted).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submit_queued_for_retry");
    expect(row?.quickbasePushAttempts).toBe(1);
  });

  it("not-yet-due row is skipped (next_retry_at in the future)", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchSpy = vi.spyOn(global, "fetch");

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("notdue");
    await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 1,
      nextRetryAt: new Date(Date.now() + 60 * 60 * 1000), // due in 1hr
    });

    const r = await runQbRetrySweeper();
    expect(r.attempted).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("due row + 2xx → submitted_to_sterling, next_retry_at cleared", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ metadata: { createdRecordIds: [4242] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("2xx");
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 1,
      nextRetryAt: new Date(Date.now() - 60_000),
    });

    const r = await runQbRetrySweeper();
    expect(r.attempted).toBe(1);
    expect(r.succeeded).toBe(1);

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submitted_to_sterling");
    expect(row?.quickbaseRecordId).toBe("4242");
    expect(row?.quickbaseNextRetryAt).toBeNull();
    expect(row?.quickbasePushAttempts).toBe(2);
  });

  it("due row + 5xx with budget left → stays queued, attempt++, next_retry_at advances", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("upstream", { status: 503 }),
    );

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("5xx");
    const firstAttemptAt = new Date(Date.now() - 60_000);
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 1, // sweep produces attempt 2 → 30min backoff
      nextRetryAt: firstAttemptAt,
    });

    const r = await runQbRetrySweeper();
    expect(r.attempted).toBe(1);
    expect(r.requeued).toBe(1);

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submit_queued_for_retry");
    expect(row?.quickbasePushAttempts).toBe(2);
    // Roughly 30 minutes from now — allow some clock skew + test
    // execution time.
    const delta = row!.quickbaseNextRetryAt!.getTime() - Date.now();
    expect(delta).toBeGreaterThan(29 * 60 * 1000);
    expect(delta).toBeLessThan(31 * 60 * 1000);
  });

  it("due row + 5xx at attempt 5 → exhausted → submit_failed_validation", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("still bad", { status: 503 }),
    );

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("exhausted");
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 5, // next failure → attempt 6 → null delay → exhausted
      nextRetryAt: new Date(Date.now() - 60_000),
    });

    const r = await runQbRetrySweeper();
    expect(r.attempted).toBe(1);
    expect(r.exhausted).toBe(1);

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submit_failed_validation");
    expect(row?.quickbaseLastError).toContain("max retries exhausted");
    expect(row?.quickbaseNextRetryAt).toBeNull();
    expect(row?.quickbasePushAttempts).toBe(6);
  });

  it("due row + 4xx → submit_failed_validation (terminal, no retry)", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("missing field", { status: 400 }),
    );

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("4xx");
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 2,
      nextRetryAt: new Date(Date.now() - 60_000),
    });

    const r = await runQbRetrySweeper();
    expect(r.failedValidation).toBe(1);

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submit_failed_validation");
    expect(row?.quickbaseNextRetryAt).toBeNull();
  });

  it("carrier config drifted away from anderson_quickbase → submit_failed_validation (no infinite loop)", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchSpy = vi.spyOn(global, "fetch");

    // Carrier was seeded with anderson_quickbase, then config got
    // edited (e.g. partner deactivated). Sweeper detects this on
    // dequeue and flips to terminal failure rather than infinitely
    // re-trying with no valid config.
    const { carrierId, jobId } = await seedCarrierAndJob({
      handoff_type: "something_else",
    });
    const driverId = await seedDriver("drift");
    const stageId = await seedQueuedStage({
      driverId,
      jobId,
      carrierId,
      attempts: 1,
      nextRetryAt: new Date(Date.now() - 60_000),
    });

    const r = await runQbRetrySweeper();
    expect(r.failedValidation).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled(); // never even tried the push

    const row = await getStageRow(stageId);
    expect(row?.stage).toBe("submit_failed_validation");
    expect(row?.quickbaseLastError).toContain("no longer routes");
  });
});

// Suppress the "and" import-not-used lint when shipping fewer helpers.
void and;
