import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { matchDriver } from "@/lib/matching";
import {
  clearDrivers,
  deletePermissiveJobsByTitle,
  getCarrierIdByName,
  insertPermissiveJobsInAtlanta,
  insertTestDriver,
} from "./testHelpers";

// Coordinates used throughout
const ATLANTA = { lat: "33.749000", lng: "-84.388000" };
const AURORA_CO = { lat: "39.729000", lng: "-104.832000" };
const HONOLULU = { lat: "21.317000", lng: "-157.858000" };

beforeAll(async () => {
  await clearDrivers();
});

afterAll(async () => {
  await clearDrivers();
  await deletePermissiveJobsByTitle();
});

afterEach(async () => {
  await clearDrivers();
});

describe("matchDriver — empty matches", () => {
  it("returns no matches for a driver in Hawaii with no jobs in HI", async () => {
    const id = await insertTestDriver({
      homeLat: HONOLULU.lat,
      homeLng: HONOLULU.lng,
      cdlState: "HI",
      desiredEquipment: ["reefer"],
    });
    const result = await matchDriver(id);
    expect(result.matches).toEqual([]);
    expect(result.truncated).toBe(false);
    expect(result.driverId).toBe(id);
  });
});

describe("matchDriver — single match", () => {
  it("returns the Atlanta reefer carrier for an Atlanta-area driver", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
      sapStatus: "not-in-sap",
    });
    const result = await matchDriver(id);
    const cities = result.matches.map((m) => m.domicileCity);
    expect(cities).toContain("Atlanta");
  });
});

describe("matchDriver — geospatial", () => {
  it("Aurora CO driver matches Denver (within radius) and NOT Dallas (out of radius)", async () => {
    const id = await insertTestDriver({
      homeLat: AURORA_CO.lat,
      homeLng: AURORA_CO.lng,
      cdlState: "CO",
      desiredEquipment: ["dry-van", "flatbed"],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    const cities = result.matches.map((m) => m.domicileCity);
    expect(cities).toContain("Denver");
    expect(cities).not.toContain("Dallas");
  });

  it("an OTR job with NULL hiring_radius_miles matches a driver from any location", async () => {
    const id = await insertTestDriver({
      homeLat: HONOLULU.lat,
      homeLng: HONOLULU.lng,
      cdlState: "HI",
      desiredEquipment: ["dry-van"],
      homeTime: ["otr"],
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const positions = result.matches.map((m) => m.positionTitle);
    expect(positions).toContain("OTR CDL-A Dry Van — Nationwide");
  });

  it("an OTR job (NULL radius) does NOT match a driver who only wants weekly home time", async () => {
    // Regression for the production bug: Swift jobs with lob=OTR have
    // hiring_radius_miles=NULL, but their accepted_home_time_types can
    // include 'weekly' (from the Smartsheet Home Time text). The
    // matcher used to treat NULL radius as "match anyone everywhere",
    // so a CA driver wanting weekly was getting an OTR job in TN.
    //
    // Correct behavior: NULL radius implies "this is OTR" and the
    // driver must explicitly want OTR (have 'otr' in their home_time
    // array). Home-time overlap alone is not enough.
    const { db } = await import("@/db/client");
    const { carrierJobs } = await import("@/db/schema");
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    // Insert a misconfigured job: NULL radius + accepts both weekly AND otr.
    await db.insert(carrierJobs).values({
      carrierId,
      status: "active",
      positionTitle: "Misconfigured OTR/Weekly Dry Van",
      domicileCity: "Memphis",
      domicileState: "TN",
      domicileLat: "35.149500",
      domicileLng: "-90.048800",
      hiringRadiusMiles: null,
      equipment: "dry-van",
      minExperienceMonths: 0,
      acceptedHomeTimeTypes: ["weekly", "otr"],
      payRangeMaxWeeklyUsd: 1500,
      sapTolerance: "accepts_all",
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com/apply",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    });

    try {
      const id = await insertTestDriver({
        homeLat: HONOLULU.lat,
        homeLng: HONOLULU.lng,
        cdlState: "HI",
        desiredEquipment: ["dry-van"],
        homeTime: ["weekly"], // explicitly NOT 'otr'
        yearsHeld: 2,
      });
      const result = await matchDriver(id);
      const positions = result.matches.map((m) => m.positionTitle);
      expect(positions).not.toContain("Misconfigured OTR/Weekly Dry Van");
    } finally {
      const { sql } = await import("drizzle-orm");
      await db.execute(
        sql`DELETE FROM carrier_jobs WHERE position_title = 'Misconfigured OTR/Weekly Dry Van'`,
      );
    }
  });
});

describe("matchDriver — willing_to_relocate", () => {
  it("Aurora driver willing to relocate sees Texas OTR flatbed", async () => {
    const id = await insertTestDriver({
      homeLat: AURORA_CO.lat,
      homeLng: AURORA_CO.lng,
      cdlState: "CO",
      desiredEquipment: ["flatbed"],
      homeTime: ["otr"],
      yearsHeld: 2,
      willingToRelocate: true,
    });
    const result = await matchDriver(id);
    const positions = result.matches.map((m) => m.positionTitle);
    expect(positions).toContain("Texas-Domiciled OTR CDL-A Flatbed");
  });

  it("Aurora driver NOT willing to relocate does not see Texas OTR flatbed", async () => {
    const id = await insertTestDriver({
      homeLat: AURORA_CO.lat,
      homeLng: AURORA_CO.lng,
      cdlState: "CO",
      desiredEquipment: ["flatbed"],
      homeTime: ["otr"],
      yearsHeld: 2,
      willingToRelocate: false,
    });
    const result = await matchDriver(id);
    const positions = result.matches.map((m) => m.positionTitle);
    expect(positions).not.toContain("Texas-Domiciled OTR CDL-A Flatbed");
  });
});

describe("matchDriver — equipment hard filter", () => {
  it("driver wanting dry-van does not see reefer or flatbed jobs", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["dry-van"],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    for (const m of result.matches) {
      expect(m.equipment).toBe("dry-van");
    }
  });
});

describe("matchDriver — endorsement hard filter", () => {
  it("driver lacking required endorsement is excluded", async () => {
    // Add a job that requires hazmat
    const carrierId = await getCarrierIdByName("Atlanta Reefer Co (composite)");
    // Insert ad-hoc job requiring hazmat
    const { db } = await import("@/db/client");
    const { carrierJobs } = await import("@/db/schema");
    await db.insert(carrierJobs).values({
      carrierId,
      status: "active",
      positionTitle: "Hazmat-required Reefer Atlanta",
      domicileCity: "Atlanta",
      domicileState: "GA",
      domicileLat: "33.749000",
      domicileLng: "-84.388000",
      hiringRadiusMiles: 75,
      equipment: "reefer",
      minExperienceMonths: 0,
      requiredEndorsements: ["hazmat"],
      acceptedHomeTimeTypes: ["weekly"],
      payRangeMaxWeeklyUsd: 2000,
      sapTolerance: "accepts_all",
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com/apply",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    });

    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      endorsements: [],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).not.toContain("Hazmat-required Reefer Atlanta");

    // Cleanup the ad-hoc job
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`DELETE FROM carrier_jobs WHERE position_title = 'Hazmat-required Reefer Atlanta'`,
    );
  });
});

describe("matchDriver — experience hard filter", () => {
  it("driver with 1 year does not see jobs requiring 24 months", async () => {
    // The Atlanta Reefer Co job requires 24 months
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 1,
    });
    const result = await matchDriver(id);
    const names = result.matches.map((m) => m.carrierName);
    expect(names).not.toContain("Atlanta Reefer Co (composite)");
  });
});

describe("matchDriver — pay floor", () => {
  it("driver $1000/wk floor sees jobs with max >= 1000", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      minWeeklyPay: 1000,
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    for (const m of result.matches) {
      // either the pay max >= 1000 OR pay is null (payWarning shown)
      if (m.payRangeMaxWeekly != null) {
        expect(m.payRangeMaxWeekly).toBeGreaterThanOrEqual(1000);
      } else {
        expect(m.payWarning).toBe("pay_not_disclosed");
      }
    }
  });

  it("driver with $3000/wk floor does not see Atlanta Reefer Co ($1800 max)", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      minWeeklyPay: 3000,
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    const names = result.matches.map((m) => m.carrierName);
    expect(names).not.toContain("Atlanta Reefer Co (composite)");
  });

  it("driver $1000/wk floor sees null-pay job with pay_not_disclosed warning", async () => {
    // The "Prospect Sparse Carrier" Houston flatbed has pay_range_max_weekly_usd = null
    const id = await insertTestDriver({
      homeLat: "29.762000",
      homeLng: "-95.382000",
      cdlState: "TX",
      desiredEquipment: ["flatbed"],
      minWeeklyPay: 1000,
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const sparse = result.matches.find(
      (m) => m.carrierName === "Prospect Sparse Carrier (composite)",
    );
    expect(sparse).toBeTruthy();
    expect(sparse?.payWarning).toBe("pay_not_disclosed");
  });
});

describe("matchDriver — SAP tolerance", () => {
  // The Atlanta Reefer Co job has sap_tolerance = accepts_completed_only
  // The Midwest Dry Van job has sap_tolerance = accepts_none
  // We test the three driver SAP states against jobs with each tolerance

  it("driver not-in-sap matches an accepts_none job", async () => {
    const id = await insertTestDriver({
      homeLat: "39.768000",
      homeLng: "-86.158000",
      cdlState: "IN",
      desiredEquipment: ["dry-van"],
      sapStatus: "not-in-sap",
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const names = result.matches.map((m) => m.carrierName);
    expect(names).toContain("Midwest Dry Van (composite)");
  });

  it("driver completed-sap does NOT match accepts_none but matches accepts_completed_only", async () => {
    const id = await insertTestDriver({
      homeLat: "39.768000",
      homeLng: "-86.158000",
      cdlState: "IN",
      desiredEquipment: ["dry-van"],
      sapStatus: "completed-sap",
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const names = result.matches.map((m) => m.carrierName);
    expect(names).not.toContain("Midwest Dry Van (composite)");

    // Now check completed-sap matches an accepts_completed_only job (Atlanta Reefer Co).
    // Use an expired Tier 1 window so the Atlanta Reefer Co Tier 2 job isn't
    // suppressed by Southeast Multi-Equipment's Tier 1 exclusivity.
    const id2 = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      sapStatus: "completed-sap",
      yearsHeld: 3,
    });
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const result2 = await matchDriver(id2, { now, getFirstMatchTime: async () => past });
    const names2 = result2.matches.map((m) => m.carrierName);
    expect(names2).toContain("Atlanta Reefer Co (composite)");
  });

  it("driver in-sap matches only accepts_all jobs", async () => {
    // Add a job with accepts_all tolerance for this test
    const carrierId = await getCarrierIdByName("Midwest Dry Van (composite)");
    const { db } = await import("@/db/client");
    const { carrierJobs } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    await db.insert(carrierJobs).values({
      carrierId,
      status: "active",
      positionTitle: "SAP-all Test Job Indy",
      domicileCity: "Indianapolis",
      domicileState: "IN",
      domicileLat: "39.768000",
      domicileLng: "-86.158000",
      hiringRadiusMiles: 75,
      equipment: "dry-van",
      minExperienceMonths: 0,
      acceptedHomeTimeTypes: ["weekly"],
      payRangeMaxWeeklyUsd: 1600,
      sapTolerance: "accepts_all",
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    });

    const id = await insertTestDriver({
      homeLat: "39.768000",
      homeLng: "-86.158000",
      cdlState: "IN",
      desiredEquipment: ["dry-van"],
      sapStatus: "in-sap",
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).toContain("SAP-all Test Job Indy");
    // The original Midwest Dry Van job is accepts_none → should be excluded
    expect(titles).not.toContain("Regional CDL-A Dry Van Driver — Indianapolis");

    await db.execute(
      sql`DELETE FROM carrier_jobs WHERE position_title = 'SAP-all Test Job Indy'`,
    );
  });
});

describe("matchDriver — Tier 1 exclusivity", () => {
  it("driver matching Tier 1 carrier sees Tier 1 jobs and Tier 2 jobs are EXCLUDED for same equipment+state", async () => {
    // Southeast Multi-Equipment (Tier 1, current) has Atlanta GA reefer.
    // Atlanta Reefer Co (Tier 2, partner) also has Atlanta GA reefer.
    // Driver in Atlanta with reefer should see Tier 1 only.
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    const names = result.matches.map((m) => m.carrierName);
    expect(names).toContain("Southeast Multi-Equipment (composite)");
    expect(names).not.toContain("Atlanta Reefer Co (composite)");
    const t1 = result.matches.find(
      (m) => m.carrierName === "Southeast Multi-Equipment (composite)",
    );
    expect(t1?.exclusivityWindowEndsAt).toBeTruthy();
  });

  it("expired exclusivity window: both Tier 1 and Tier 2 appear", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    // Stub getFirstMatchTime to return 25 hours ago for every carrier
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const result = await matchDriver(id, {
      now,
      getFirstMatchTime: async () => past,
    });
    const names = result.matches.map((m) => m.carrierName);
    expect(names).toContain("Southeast Multi-Equipment (composite)");
    expect(names).toContain("Atlanta Reefer Co (composite)");
    // Tier 1 job should NOT have an exclusivity window since it's expired
    const t1 = result.matches.find(
      (m) => m.carrierName === "Southeast Multi-Equipment (composite)",
    );
    expect(t1?.exclusivityWindowEndsAt).toBeNull();
  });
});

describe("matchDriver — label mapping", () => {
  it("subscription tier_1 → 'Sponsored Match', partner non-t1 → 'Referral Partner', etc.", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer", "dry-van", "flatbed"],
      yearsHeld: 3,
      willingToRelocate: true,
      homeTime: ["weekly"],
    });
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const result = await matchDriver(id, {
      now,
      getFirstMatchTime: async () => past, // expired window so all show
    });
    const byName = new Map(result.matches.map((m) => [m.carrierName, m]));
    expect(byName.get("Southeast Multi-Equipment (composite)")?.label).toBe(
      "Sponsored Match",
    );
    expect(byName.get("Atlanta Reefer Co (composite)")?.label).toBe(
      "Referral Partner",
    );
  });

  it("subscription tier_2 → null label", async () => {
    // Driver in Orlando matches Florida Regional (subscription, tier_2)
    const id = await insertTestDriver({
      homeLat: "28.538000",
      homeLng: "-81.379000",
      cdlState: "FL",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    const florida = result.matches.find(
      (m) => m.carrierName === "Florida Regional (composite)",
    );
    expect(florida).toBeTruthy();
    expect(florida?.label).toBe(null);
  });

  it("prospect carrier (kind=prospect, tier=none) → 'Public Job Posting'", async () => {
    const id = await insertTestDriver({
      homeLat: "29.762000",
      homeLng: "-95.382000",
      cdlState: "TX",
      desiredEquipment: ["flatbed"],
      yearsHeld: 2,
    });
    const result = await matchDriver(id);
    const prospect = result.matches.find(
      (m) => m.carrierName === "Prospect Sparse Carrier (composite)",
    );
    expect(prospect?.label).toBe("Public Job Posting");
  });
});

describe("matchDriver — match cap at 20", () => {
  it("returns 20 matches and truncated=true when 25 jobs pass hard filters", async () => {
    const carrierId = await getCarrierIdByName("Atlanta Reefer Co (composite)");
    await insertPermissiveJobsInAtlanta(25, carrierId);

    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 5,
      sapStatus: "completed-sap",
    });
    // Make sure Tier 1 exclusivity doesn't suppress these — set first-match in
    // the distant past so all carriers show.
    const now = new Date();
    const result = await matchDriver(id, {
      now,
      getFirstMatchTime: async () => new Date(now.getTime() - 48 * 60 * 60 * 1000),
    });
    expect(result.matches.length).toBe(20);
    expect(result.truncated).toBe(true);

    await deletePermissiveJobsByTitle();
  });
});

describe("matchDriver — application surface in result", () => {
  it("includes applicationSurface, applicationUrl, applicationPhone on each match", async () => {
    const id = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const result = await matchDriver(id);
    expect(result.matches.length).toBeGreaterThan(0);
    for (const m of result.matches) {
      expect(typeof m.applicationSurface).toBe("string");
      expect("applicationUrl" in m).toBe(true);
      expect("applicationPhone" in m).toBe(true);
    }
  });
});

describe("matchDriver — soft rank ordering", () => {
  it("driver whose equipment_run overlaps preferred_equipment_experience ranks higher", async () => {
    // Compare two drivers in Atlanta:
    // - driverA: equipment_run = ["reefer"] (matches Atlanta Reefer Co's preferred=["reefer","dry-van"])
    // - driverB: equipment_run = ["box-truck"] (matches nothing)
    // With expired tier 1 windows so multiple carriers appear and ordering is observable.
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    const aId = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      equipmentRun: ["reefer", "dry-van"],
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const aResult = await matchDriver(aId, { now, getFirstMatchTime: async () => past });
    const aReefer = aResult.matches.find(
      (m) => m.carrierName === "Atlanta Reefer Co (composite)",
    );
    expect(aReefer).toBeTruthy();
    // equipment overlap = 1 (reefer matches), region 0/1, distance 1 (within 50mi), dq 1 → at least 4
    expect(aReefer!.softRankScore).toBeGreaterThanOrEqual(3);
    await clearDrivers();

    const bId = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      equipmentRun: ["box-truck"],
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const bResult = await matchDriver(bId, { now, getFirstMatchTime: async () => past });
    const bReefer = bResult.matches.find(
      (m) => m.carrierName === "Atlanta Reefer Co (composite)",
    );
    expect(bReefer).toBeTruthy();
    // No equipment overlap; score should be lower
    expect(aReefer!.softRankScore).toBeGreaterThan(bReefer!.softRankScore);
  });
});

describe("matchDriver — data quality affects ranking", () => {
  it("complete jobs rank higher than minimal jobs all else being equal", async () => {
    const id = await insertTestDriver({
      homeLat: "29.762000",
      homeLng: "-95.382000",
      cdlState: "TX",
      desiredEquipment: ["flatbed"],
      yearsHeld: 5,
    });
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    const result = await matchDriver(id, { now, getFirstMatchTime: async () => past });
    const complete = result.matches.find((m) => m.dataQuality === "complete");
    const minimal = result.matches.find((m) => m.dataQuality === "minimal");
    if (complete && minimal) {
      expect(complete.softRankScore).toBeGreaterThanOrEqual(minimal.softRankScore);
    }
    // Even if one is missing, at minimum: complete >= minimal in the result order
    if (complete && minimal) {
      const completeIdx = result.matches.indexOf(complete);
      const minimalIdx = result.matches.indexOf(minimal);
      expect(completeIdx).toBeLessThan(minimalIdx);
    }
  });
});

describe("matchDriver — distance score", () => {
  it("driver within 50mi ranks higher than driver outside 50mi but within radius (same job)", async () => {
    // Driver in Atlanta (distance to Atlanta domicile ~0mi) → distance_score = 1
    // Driver near edge of 75mi radius → distance_score = 0.5
    // For the Atlanta Reefer Co job (75 mi radius).
    const now = new Date();
    const past = new Date(now.getTime() - 25 * 60 * 60 * 1000);

    const closeId = await insertTestDriver({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const closeResult = await matchDriver(closeId, {
      now,
      getFirstMatchTime: async () => past,
    });
    const close = closeResult.matches.find(
      (m) => m.carrierName === "Atlanta Reefer Co (composite)",
    );

    await clearDrivers();

    // ~60mi from Atlanta — Macon GA: 32.840, -83.633 (about 80 miles too far)
    // Need a point that's 50-75mi away. Try Athens GA: 33.961, -83.378 (~70mi from ATL).
    const farId = await insertTestDriver({
      homeLat: "33.961000",
      homeLng: "-83.378000",
      cdlState: "GA",
      desiredEquipment: ["reefer"],
      yearsHeld: 3,
    });
    const farResult = await matchDriver(farId, {
      now,
      getFirstMatchTime: async () => past,
    });
    const far = farResult.matches.find(
      (m) => m.carrierName === "Atlanta Reefer Co (composite)",
    );

    expect(close).toBeTruthy();
    expect(far).toBeTruthy();
    expect(close!.softRankScore).toBeGreaterThan(far!.softRankScore);
  });
});
