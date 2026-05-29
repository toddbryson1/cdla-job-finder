// Integration tests for the top-up orchestrator. Hits the seed DB to
// verify cache reads and upserts. Adzuna calls are mocked via the
// fetchImpl seam.

import { describe, expect, it, beforeEach } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { topUpWithExternal } from "@/lib/external-jobs/searchExternalJobs";
import { __test__ } from "@/lib/external-jobs/searchExternalJobs";
import type { DriverGeoProfile } from "@/lib/external-jobs/types";

// Atlanta-ish driver used in most tests.
const atlantaDriver: DriverGeoProfile = {
  id: "00000000-0000-0000-0000-000000000001",
  homeLat: 33.7490,
  homeLng: -84.3880,
  desiredEquipment: ["reefer"],
  minWeeklyPay: 0,
  willingToRelocate: false,
};

const adzunaResponse = (overrides: { id?: string; lat?: number; lng?: number } = {}) =>
  new Response(
    JSON.stringify({
      results: [
        {
          id: overrides.id ?? "atl-1",
          title: "Class A CDL Reefer Driver",
          description: "Regional reefer out of Atlanta",
          company: { display_name: "Test Carrier" },
          location: { area: ["US", "GA", "Atlanta"] },
          latitude: overrides.lat ?? 33.75,
          longitude: overrides.lng ?? -84.39,
          salary_min: 60000,
          salary_max: 85000,
          salary_is_predicted: "0",
          redirect_url: "https://example.com/job/atl-1",
          created: "2026-05-25T00:00:00Z",
        },
      ],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );

async function clearExternalJobs() {
  await db.execute(sql`TRUNCATE TABLE external_jobs RESTART IDENTITY CASCADE`);
}

describe("topUpWithExternal — gating", () => {
  beforeEach(async () => {
    await clearExternalJobs();
  });

  it("returns [] when internal already meets target", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 5,
        fetchImpl: () => Promise.resolve(adzunaResponse()),
      });
      expect(out).toEqual([]);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("returns [] when Adzuna is not configured", async () => {
    const savedId = process.env.ADZUNA_APP_ID;
    const savedKey = process.env.ADZUNA_APP_KEY;
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
    try {
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 0,
        fetchImpl: () => Promise.resolve(adzunaResponse()),
      });
      expect(out).toEqual([]);
    } finally {
      if (savedId !== undefined) process.env.ADZUNA_APP_ID = savedId;
      if (savedKey !== undefined) process.env.ADZUNA_APP_KEY = savedKey;
    }
  });
});

describe("topUpWithExternal — cache miss then hit", () => {
  beforeEach(async () => {
    await clearExternalJobs();
  });

  it("on miss: hits Adzuna, upserts, returns rows with stable ids", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      let calls = 0;
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 0,
        fetchImpl: () => {
          calls++;
          return Promise.resolve(adzunaResponse());
        },
      });
      expect(calls).toBe(1);
      expect(out.length).toBe(1);
      expect(out[0].externalJobId).toMatch(/^[0-9a-f-]{36}$/);
      expect(out[0].title).toBe("Class A CDL Reefer Driver");
      expect(out[0].source).toBe("adzuna");
      expect(out[0].redirectUrl).toBe("https://example.com/job/atl-1");
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("on second call: cache satisfies, no Adzuna fetch", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      // First call to populate cache.
      await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 0,
        fetchImpl: () => Promise.resolve(adzunaResponse()),
      });

      // Second call asking for only 1 (deficit = 1, cache has 1 fresh row).
      let calls = 0;
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 4,
        fetchImpl: () => {
          calls++;
          return Promise.resolve(adzunaResponse());
        },
      });
      expect(calls).toBe(0);
      expect(out.length).toBe(1);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("computes distance from driver home", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      // Listing in Athens, GA (~60 mi NE of Atlanta) — within DEFAULT_RADIUS_MILES.
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 0,
        fetchImpl: () =>
          Promise.resolve(adzunaResponse({ lat: 33.9519, lng: -83.3576 })),
      });
      expect(out.length).toBe(1);
      expect(out[0].distanceMilesFromDriverHome).toBeGreaterThan(50);
      expect(out[0].distanceMilesFromDriverHome).toBeLessThan(100);
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });

  it("excludes listings outside the bounding box", async () => {
    process.env.ADZUNA_APP_ID = "test";
    process.env.ADZUNA_APP_KEY = "test";
    try {
      // Atlanta driver, but listing is in Seattle. The Adzuna fetch
      // would be biased to Atlanta in practice; this tests the
      // post-query geo filter on the cache.
      const out = await topUpWithExternal({
        driver: atlantaDriver,
        targetCount: 5,
        internalCount: 0,
        fetchImpl: () =>
          Promise.resolve(adzunaResponse({ lat: 47.6062, lng: -122.3321 })),
      });
      expect(out).toEqual([]); // Seattle is way outside the 100mi box.
    } finally {
      delete process.env.ADZUNA_APP_ID;
      delete process.env.ADZUNA_APP_KEY;
    }
  });
});

describe("annualToWeekly", () => {
  it("converts annual to weekly using 50-week year", () => {
    expect(__test__.annualToWeekly(50000)).toBe(1000);
    expect(__test__.annualToWeekly(75000)).toBe(1500);
  });
  it("returns null for null input", () => {
    expect(__test__.annualToWeekly(null)).toBe(null);
  });
});
