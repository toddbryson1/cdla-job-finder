// Integration tests for the staging + promotion path. Uses the seed
// DB; truncates pending_carriers / pending_carrier_jobs between
// tests. Each test builds a fake DiscoveryReport, runs commit, then
// promotePendingCarrier, then asserts the live carriers +
// carrier_jobs state.

import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  carrierJobs,
  carriers,
  pendingCarriers,
} from "@/db/schema";
import { commitDiscovery } from "@/lib/carrier-discovery/persist";
import {
  promotePendingCarrier,
  rejectPendingCarrier,
} from "@/lib/carrier-discovery/promote";
import type { DiscoveredJob, DiscoveryReport } from "@/lib/carrier-discovery/types";

function makeJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    source: "json_ld",
    sourceId: "job-1",
    title: "CDL A OTR Reefer Driver",
    carrierName: "Test Carrier",
    city: "Atlanta",
    state: "GA",
    lat: 33.749,
    lng: -84.388,
    equipmentGuess: "reefer",
    payMinWeeklyUsd: 1100,
    payMaxWeeklyUsd: 1700,
    payOriginalPeriod: "WEEK",
    description: "OTR reefer over the road position",
    applyUrl: "https://testcarrier.example/apply/1",
    postedAt: new Date("2026-05-20"),
    rawSummary: "CDL A OTR Reefer Driver",
    ...overrides,
  };
}

function makeReport(jobs: DiscoveredJob[]): DiscoveryReport {
  return {
    attempts: [
      {
        source: "careers_page_lookup",
        ok: true,
        note: "conventional_path: /careers → https://testcarrier.example/careers",
      },
      {
        source: "json_ld",
        ok: true,
        note: `parsed ${jobs.length} JobPosting block(s)`,
      },
    ],
    jobs,
  };
}

async function cleanup() {
  // Remove anything created by these tests. We use deterministic
  // carrier names ("Test Carrier", "Other Carrier") so we don't
  // clobber other test fixtures.
  await db.execute(
    sql`DELETE FROM pending_carriers WHERE LOWER(name) IN ('test carrier', 'other carrier', 'duplicate carrier')`,
  );
  await db.execute(
    sql`DELETE FROM carriers WHERE LOWER(name) IN ('test carrier', 'other carrier', 'duplicate carrier')`,
  );
}

describe("commitDiscovery", () => {
  beforeEach(cleanup);

  it("creates a pending_carriers row + jobs on first commit", async () => {
    const result = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([makeJob()]),
    });
    expect(result.isReDiscovery).toBe(false);
    expect(result.jobsInserted).toBe(1);
    const row = await db.query.pendingCarriers.findFirst({
      where: eq(pendingCarriers.id, result.pendingCarrierId),
    });
    expect(row?.name).toBe("Test Carrier");
    expect(row?.status).toBe("pending");
  });

  it("classifies application_surface on staging insert", async () => {
    const result = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "tenstreet-1",
          applyUrl: "https://intelliapp.driverapponline.com/c/testcarrier",
        }),
        makeJob({
          sourceId: "self-1",
          applyUrl: "https://testcarrier.example/jobs/1",
        }),
      ]),
    });
    const rows = (await db.execute(sql`
      SELECT source_id, application_surface FROM pending_carrier_jobs
      WHERE pending_carrier_id = ${result.pendingCarrierId}
    `)) as unknown as Array<{ source_id: string; application_surface: string }>;
    const bySourceId = new Map(rows.map((r) => [r.source_id, r.application_surface]));
    expect(bySourceId.get("tenstreet-1")).toBe("tenstreet_intelliapp");
    expect(bySourceId.get("self-1")).toBe("custom_intake_form");
  });

  it("re-discovery replaces the job set", async () => {
    const first = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([makeJob({ sourceId: "old-1" })]),
    });
    const second = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({ sourceId: "new-1" }),
        makeJob({ sourceId: "new-2" }),
      ]),
    });
    expect(second.isReDiscovery).toBe(true);
    expect(second.pendingCarrierId).toBe(first.pendingCarrierId);
    expect(second.jobsInserted).toBe(2);

    const rows = (await db.execute(sql`
      SELECT source_id FROM pending_carrier_jobs
      WHERE pending_carrier_id = ${first.pendingCarrierId}
    `)) as unknown as Array<{ source_id: string }>;
    const ids = rows.map((r) => r.source_id).sort();
    expect(ids).toEqual(["new-1", "new-2"]);
  });

  it("name match is case-insensitive", async () => {
    const a = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://x.example",
      report: makeReport([makeJob()]),
    });
    const b = await commitDiscovery({
      name: "test carrier",
      homepageUrl: "https://x.example",
      report: makeReport([makeJob()]),
    });
    expect(b.pendingCarrierId).toBe(a.pendingCarrierId);
  });
});

describe("promotePendingCarrier", () => {
  beforeEach(cleanup);

  it("creates a new carrier + carrier_jobs rows", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([makeJob()]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    expect(result.isNewCarrier).toBe(true);
    expect(result.jobsInserted).toBe(1);
    expect(result.jobsSkipped).toBe(0);
    const carrier = await db.query.carriers.findFirst({
      where: eq(carriers.id, result.carrierId),
    });
    expect(carrier?.kind).toBe("prospect");
    expect(carrier?.status).toBe("active");
    expect(carrier?.publicCareersUrl).toBeTruthy();
  });

  it("sets carrier_jobs OTR-correctly for OTR-titled jobs", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "otr-1",
          title: "CDL A OTR Driver",
          description: "Over the road position",
        }),
      ]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    const job = await db.query.carrierJobs.findFirst({
      where: eq(carrierJobs.carrierId, result.carrierId),
    });
    expect(job?.hiringRadiusMiles).toBeNull();
    expect(job?.acceptedHomeTimeTypes).toContain("otr");
  });

  it("sets Home Weekly jobs to weekly + 200mi radius", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "weekly-1",
          title: "CDL A Truck Driver Home Weekly Dedicated",
          description: "Home weekly dedicated runs",
        }),
      ]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    const job = await db.query.carrierJobs.findFirst({
      where: eq(carrierJobs.carrierId, result.carrierId),
    });
    expect(job?.acceptedHomeTimeTypes).toEqual(["weekly"]);
    expect(job?.hiringRadiusMiles).toBe(200);
  });

  it("skips jobs that can't be located (no city/state and no geocode hit)", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "nogeo-1",
          city: null,
          state: null,
          lat: null,
          lng: null,
        }),
      ]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    expect(result.jobsInserted).toBe(0);
    expect(result.jobsSkipped).toBe(1);
    expect(result.skipReasons[0]).toMatch(/no city\/state/);
  });

  it("idempotent on re-promotion via external_source_id", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([makeJob({ sourceId: "stable-1" })]),
    });
    const first = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    // Re-stage same source_id, re-promote — should update, not duplicate.
    const reStaged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({ sourceId: "stable-1", title: "Updated Title" }),
      ]),
    });
    const second = await promotePendingCarrier(reStaged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    expect(second.carrierId).toBe(first.carrierId);
    expect(second.jobsInserted).toBe(0);
    expect(second.jobsUpdated).toBe(1);

    const jobs = await db.query.carrierJobs.findMany({
      where: eq(carrierJobs.carrierId, first.carrierId),
    });
    expect(jobs.length).toBe(1);
    expect(jobs[0].positionTitle).toBe("Updated Title");
  });

  it("data_quality assignment: complete when pay + equipment present", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "complete-1",
          equipmentGuess: "reefer",
          payMaxWeeklyUsd: 1700,
        }),
      ]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    const job = await db.query.carrierJobs.findFirst({
      where: eq(carrierJobs.carrierId, result.carrierId),
    });
    expect(job?.dataQuality).toBe("complete");
  });

  it("data_quality assignment: minimal when nothing extra known", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([
        makeJob({
          sourceId: "minimal-1",
          equipmentGuess: null,
          payMaxWeeklyUsd: null,
          payMinWeeklyUsd: null,
        }),
      ]),
    });
    const result = await promotePendingCarrier(staged.pendingCarrierId, {
      reviewerEmail: "admin@example.com",
    });
    const job = await db.query.carrierJobs.findFirst({
      where: eq(carrierJobs.carrierId, result.carrierId),
    });
    expect(job?.dataQuality).toBe("minimal");
  });
});

describe("rejectPendingCarrier", () => {
  beforeEach(cleanup);

  it("marks status=rejected without creating live rows", async () => {
    const staged = await commitDiscovery({
      name: "Test Carrier",
      homepageUrl: "https://testcarrier.example",
      report: makeReport([makeJob()]),
    });
    await rejectPendingCarrier(
      staged.pendingCarrierId,
      "admin@example.com",
      "not a real carrier",
    );
    const row = await db.query.pendingCarriers.findFirst({
      where: eq(pendingCarriers.id, staged.pendingCarrierId),
    });
    expect(row?.status).toBe("rejected");
    expect(row?.notes).toBe("not a real carrier");
    const live = await db.query.carriers.findFirst({
      where: sql`LOWER(${carriers.name}) = 'test carrier'`,
    });
    expect(live).toBeUndefined();
  });
});
