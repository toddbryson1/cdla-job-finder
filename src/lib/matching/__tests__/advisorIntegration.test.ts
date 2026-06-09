import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { matchDriver } from "@/lib/matching";
import {
  db,
  carriers,
  carrierJobs,
  clearDrivers,
  insertTestDriver,
} from "@/lib/matching/__tests__/testHelpers";

// Proves the FULL advisor data path against a real DB — not synthetic
// rows: carriers.fit_tier_profile + accepted_home_time_types actually
// flow through the hardFilter SQL into softRank, and a real driver's
// priority_ranking threads from the drivers row through matchDriver into
// the Match.fitReasons the UI renders. This is the integration the
// synthetic softRank.test.ts can't cover.

const ATL_LAT = "33.749000";
const ATL_LNG = "-84.388000";
let carrierId: string;
let jobId: string;

beforeAll(async () => {
  await clearDrivers();
  // A carrier with an England-style fit-tier profile: strong on-ramp at
  // 3–12 months, fades past 24.
  const [c] = await db
    .insert(carriers)
    .values({
      name: `Advisor IT Carrier ${Date.now()}`,
      kind: "partner",
      tier: "none",
      status: "active",
      fitTierProfile: {
        experience: { strongMinMonths: 3, strongMaxMonths: 12, fadesAfterMonths: 24 },
      },
    })
    .returning({ id: carriers.id });
  carrierId = c!.id;

  const [j] = await db
    .insert(carrierJobs)
    .values({
      carrierId,
      status: "active",
      positionTitle: "Advisor IT Reefer",
      domicileCity: "Atlanta",
      domicileState: "GA",
      domicileLat: ATL_LAT,
      domicileLng: ATL_LNG,
      hiringRadiusMiles: 150,
      equipment: "reefer",
      minExperienceMonths: 0,
      acceptedHomeTimeTypes: ["weekly"],
      payRangeMaxWeeklyUsd: 1600,
      displayPayRangeMinWeeklyUsd: 1200,
      displayPayRangeMaxWeeklyUsd: 1600,
      sapTolerance: "accepts_all",
      preferredEquipmentExperience: ["reefer"],
      preferredRegions: ["southeast"],
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com/apply",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    })
    .returning({ id: carrierJobs.id });
  jobId = j!.id;
});

afterAll(async () => {
  await clearDrivers();
  // Deleting the carrier cascades to its job — leaves seed data intact.
  await db.delete(carriers).where(eq(carriers.id, carrierId));
});

describe("advisor ranking — real DB integration", () => {
  it("threads fit-tier profile + priority_ranking into Match.fitReasons", async () => {
    // 6-month driver (in the strong band), home-time-first.
    const driverId = await insertTestDriver({
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      cdlState: "GA",
      yearsHeld: 0.5, // 6 months → inside the 3–12 strong band
      equipmentRun: ["reefer"],
      desiredEquipment: ["reefer"],
      desiredRegions: ["southeast"],
      homeTime: ["weekly"],
      priorityRanking: ["home_time", "pay"],
    });

    const result = await matchDriver(driverId);
    const m = result.matches.find((x) => x.jobId === jobId);
    expect(m).toBeDefined();

    // The whole chain worked iff reasons came through: the fit-tier
    // on-ramp reason (proves jsonb profile was selected + parsed +
    // scored) AND a home-time reason (proves priority_ranking threaded).
    const reasons = m!.fitReasons.join(" ").toLowerCase();
    expect(m!.fitReasons.length).toBeGreaterThan(0);
    expect(reasons).toMatch(/on-ramp/);
    expect(reasons).toMatch(/home time/);
  });

  it("a neutral driver (no priority_ranking) still gets the fit-tier reason but no priority reasons", async () => {
    const driverId = await insertTestDriver({
      homeLat: ATL_LAT,
      homeLng: ATL_LNG,
      cdlState: "GA",
      yearsHeld: 0.5,
      equipmentRun: ["reefer"],
      desiredEquipment: ["reefer"],
      desiredRegions: ["southeast"],
      homeTime: ["weekly"],
      // no priorityRanking → neutral mode
    });

    const result = await matchDriver(driverId);
    const m = result.matches.find((x) => x.jobId === jobId);
    expect(m).toBeDefined();
    const reasons = m!.fitReasons.join(" ").toLowerCase();
    // Fit-tier reason still shows (it's meaningful in both modes)...
    expect(reasons).toMatch(/on-ramp/);
    // ...but no priority-driven reason, since the driver ranked nothing.
    expect(reasons).not.toMatch(/you ranked/);
  });
});
