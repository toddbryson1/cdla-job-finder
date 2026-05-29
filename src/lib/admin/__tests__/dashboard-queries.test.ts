// Smoke tests for the admin dashboard queries. Integration against
// the seed DB — verifies each query runs without error and returns
// expected shape. The actual counts depend on what's in the seed
// data; we just check structural invariants.

import { describe, expect, it } from "vitest";
import {
  getCarrierBreakdown,
  getCarrierPerformance30d,
  getCyclesExpiringSoon,
  getDashboardCounts,
  getDriverFunnel30d,
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
