// Integration test for the Anderson handoff handler in
// src/app/match/[driverId]/[jobId]/apply/actions.ts.
//
// Seeds a real Anderson-shaped carrier + carrier_job + driver row
// in the test DB, mocks fetch, invokes recordAndersonHandoff, and
// asserts the partner_application_stages row state for each of the
// three meaningful fetch outcomes per spec §B6.3:
//
//   2xx → submitted_to_sterling + quickbase_record_id set
//   4xx → submit_failed_validation + last_error set
//   5xx → submit_queued_for_retry + last_error set
//
// Also verifies the feature-flag-off case: the stage row still
// lands at intelliapp_link_sent, and fetch is NOT called.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  drivers,
  partnerApplicationStages,
} from "@/db/schema";
import { recordAndersonHandoff } from "@/app/match/[driverId]/[jobId]/apply/actions";

const ANDERSON_TEST_CARRIER_NAME = "Anderson QB Integration Test Carrier";
const ANDERSON_TEST_JOB_TITLE = "Anderson QB Integration Test Job";

const ANDERSON_HANDOFF_CONFIG = {
  handoff_type: "anderson_quickbase",
  intelliapp_url: "https://example.com/intelliapp",
  recruiter_param_value: "CDL Hunterl",
  source_identifier: "ia_anderson_test",
  quickbase: {
    realm_hostname: "sterlingrecruitingsolutions.quickbase.com",
    app_id: "bcivf3yss",
    table_id: "bcivf3ysv",
    api_token_secret_ref: "QUICKBASE_STERLING_API_TOKEN",
    default_recruiter_name: "Todd Bryson",
  },
};

async function cleanup() {
  // Cascade from carriers will clean carrier_jobs and
  // partner_application_stages via FK.
  await db.execute(
    sql`DELETE FROM carriers WHERE name = ${ANDERSON_TEST_CARRIER_NAME}`,
  );
  await db.execute(
    sql`DELETE FROM drivers WHERE email LIKE 'anderson-qb-test+%@example.com'`,
  );
}

async function seedCarrierAndJob(): Promise<{
  carrierId: string;
  jobId: string;
}> {
  const [carrier] = await db
    .insert(carriers)
    .values({
      name: ANDERSON_TEST_CARRIER_NAME,
      kind: "partner",
      tier: "none",
      status: "active",
      partnerHandoffConfig: ANDERSON_HANDOFF_CONFIG,
    })
    .returning({ id: carriers.id });

  if (!carrier) throw new Error("Failed to seed carrier");

  const [job] = await db
    .insert(carrierJobs)
    .values({
      carrierId: carrier.id,
      status: "active",
      positionTitle: ANDERSON_TEST_JOB_TITLE,
      domicileCity: "St. Cloud",
      domicileState: "MN",
      domicileZip: "56301",
      domicileLat: "45.557900",
      domicileLng: "-94.163200",
      hiringRadiusMiles: 1500,
      equipment: "dry-van",
      minExperienceMonths: 6,
      acceptedHomeTimeTypes: ["otr"],
      sapTolerance: "accepts_none",
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com/intelliapp",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
    })
    .returning({ id: carrierJobs.id });

  if (!job) throw new Error("Failed to seed carrier_job");

  return { carrierId: carrier.id, jobId: job.id };
}

async function seedDriver(suffix: string): Promise<string> {
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Pat",
      lastName: `Anderson${suffix}`,
      email: `anderson-qb-test+${suffix}@example.com`,
      phone: "555-555-1234",
      // Address fields land in migration 0026 and IdentityCaptureForm.
      // Seeded here so the integration tests exercise the wired QB
      // payload that lands in commit ec7b372..62caa41..<this>.
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

async function findStageRow(driverId: string, jobId: string) {
  return db.query.partnerApplicationStages.findFirst({
    where: and(
      eq(partnerApplicationStages.driverId, driverId),
      eq(partnerApplicationStages.carrierJobId, jobId),
    ),
  });
}

beforeAll(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
});

describe("recordAndersonHandoff — integration", () => {
  const origToken = process.env.QUICKBASE_STERLING_API_TOKEN;
  const origFlag = process.env.QUICKBASE_PUSH_ENABLED;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    if (origToken === undefined) delete process.env.QUICKBASE_STERLING_API_TOKEN;
    else process.env.QUICKBASE_STERLING_API_TOKEN = origToken;
    if (origFlag === undefined) delete process.env.QUICKBASE_PUSH_ENABLED;
    else process.env.QUICKBASE_PUSH_ENABLED = origFlag;
    await cleanup();
  });

  it("records intelliapp_link_sent and does NOT call fetch when feature flag off", async () => {
    delete process.env.QUICKBASE_STERLING_API_TOKEN;
    delete process.env.QUICKBASE_PUSH_ENABLED;
    const fetchSpy = vi.spyOn(global, "fetch");

    const { carrierId, jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("flagoff");

    await recordAndersonHandoff(driverId, jobId);

    expect(fetchSpy).not.toHaveBeenCalled();
    const row = await findStageRow(driverId, jobId);
    expect(row).toBeTruthy();
    expect(row!.stage).toBe("intelliapp_link_sent");
    expect(row!.carrierId).toBe(carrierId);
    expect(row!.quickbasePushAttempts).toBe(0);
    expect(row!.quickbaseRecordId).toBeNull();
    expect(row!.quickbasePushSucceededAt).toBeNull();
  });

  it("transitions to submitted_to_sterling on 2xx", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ metadata: { createdRecordIds: [9999] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const { jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("ok");

    await recordAndersonHandoff(driverId, jobId);

    const row = await findStageRow(driverId, jobId);
    expect(row).toBeTruthy();
    expect(row!.stage).toBe("submitted_to_sterling");
    expect(row!.quickbaseRecordId).toBe("9999");
    expect(row!.quickbasePushAttempts).toBe(1);
    expect(row!.quickbasePushSucceededAt).not.toBeNull();
    expect(row!.quickbaseLastError).toBeNull();
  });

  it("transitions to submit_failed_validation on 4xx (no_retry)", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("missing required field", { status: 400 }),
    );

    const { jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("4xx");

    await recordAndersonHandoff(driverId, jobId);

    const row = await findStageRow(driverId, jobId);
    expect(row).toBeTruthy();
    expect(row!.stage).toBe("submit_failed_validation");
    expect(row!.quickbasePushAttempts).toBe(1);
    expect(row!.quickbaseLastError).toContain("400");
    expect(row!.quickbasePushSucceededAt).toBeNull();
  });

  it("transitions to submit_queued_for_retry on 5xx", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("upstream timeout", { status: 503 }),
    );

    const { jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("5xx");

    await recordAndersonHandoff(driverId, jobId);

    const row = await findStageRow(driverId, jobId);
    expect(row).toBeTruthy();
    expect(row!.stage).toBe("submit_queued_for_retry");
    expect(row!.quickbasePushAttempts).toBe(1);
    expect(row!.quickbaseLastError).toContain("503");
    expect(row!.quickbasePushSucceededAt).toBeNull();
  });

  it("re-render after success is a no-op — does not re-push, keeps single row", async () => {
    // Spec §B6.3 idempotency: once a handoff lands at
    // submitted_to_sterling, the driver may refresh / navigate back to
    // the result page repeatedly. Each subsequent render must NOT call
    // QuickBase again — that would create duplicate Sterling records.
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ metadata: { createdRecordIds: [4242] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    const { jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("repeat");

    await recordAndersonHandoff(driverId, jobId);
    await recordAndersonHandoff(driverId, jobId);
    await recordAndersonHandoff(driverId, jobId);

    const all = await db.query.partnerApplicationStages.findMany({
      where: and(
        eq(partnerApplicationStages.driverId, driverId),
        eq(partnerApplicationStages.carrierJobId, jobId),
      ),
    });
    // Unique constraint enforces single row per (driver, job).
    expect(all.length).toBe(1);
    expect(all[0]!.stage).toBe("submitted_to_sterling");
    // Only the first invocation pushes. The next two short-circuit on
    // the terminal-stage guard before touching the network.
    expect(all[0]!.quickbasePushAttempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("re-render after 4xx is a no-op — spec §B6.3 forbids auto-retry on validation errors", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(
        new Response("bad field shape", { status: 400 }),
      );

    const { jobId } = await seedCarrierAndJob();
    const driverId = await seedDriver("noretry");

    await recordAndersonHandoff(driverId, jobId);
    await recordAndersonHandoff(driverId, jobId);

    const row = await findStageRow(driverId, jobId);
    expect(row?.stage).toBe("submit_failed_validation");
    expect(row?.quickbasePushAttempts).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when carrier.partner_handoff_config is null", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchSpy = vi.spyOn(global, "fetch");

    // Seed a carrier WITHOUT the anderson_quickbase handoff config.
    const [carrier] = await db
      .insert(carriers)
      .values({
        name: ANDERSON_TEST_CARRIER_NAME, // reused name; cleanup deletes by name
        kind: "partner",
        tier: "none",
        status: "active",
        partnerHandoffConfig: null,
      })
      .returning({ id: carriers.id });
    const [job] = await db
      .insert(carrierJobs)
      .values({
        carrierId: carrier!.id,
        status: "active",
        positionTitle: "Not Anderson",
        domicileCity: "St. Cloud",
        domicileState: "MN",
        domicileLat: "45.557900",
        domicileLng: "-94.163200",
        hiringRadiusMiles: 100,
        equipment: "dry-van",
        minExperienceMonths: 0,
        acceptedHomeTimeTypes: ["weekly"],
        sapTolerance: "accepts_all",
        applicationSurface: "tenstreet_intelliapp",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
      })
      .returning({ id: carrierJobs.id });

    const driverId = await seedDriver("noop");
    await recordAndersonHandoff(driverId, job!.id);

    expect(fetchSpy).not.toHaveBeenCalled();
    const row = await findStageRow(driverId, job!.id);
    expect(row).toBeUndefined();
  });
});
