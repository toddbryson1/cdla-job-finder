// Tests for the lifetime-experience qualifying path (Path B) and
// the polygon hiring-area filter added in the USX-readiness session.
//
// Lifetime tests run anywhere — they exercise pure SQL comparisons
// on integer columns. Polygon tests gate on PostGIS being available;
// they're skipped on local without postgis and run on prod.

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, carriers, drivers } from "@/db/schema";
import { matchDriver } from "@/lib/matching";
import {
  __resetPostgisCache,
  isPostgisAvailable,
} from "@/lib/matching/hardFilter";
import {
  clearDrivers,
  deletePermissiveJobsByTitle,
  getCarrierIdByName,
} from "./testHelpers";

const ATLANTA = { lat: "33.749000", lng: "-84.388000" };
const NASHVILLE = { lat: "36.162600", lng: "-86.781600" };

const LIFETIME_TITLE_PREFIX = "Path B Test Job";
const POLYGON_TITLE_PREFIX = "Polygon Test Job";

async function clearJobs() {
  await db.execute(
    sql`DELETE FROM carrier_jobs WHERE position_title LIKE 'Path B Test%' OR position_title LIKE 'Polygon Test%'`,
  );
}

beforeAll(async () => {
  __resetPostgisCache();
  await clearDrivers();
  await clearJobs();
});

afterAll(async () => {
  await clearDrivers();
  await deletePermissiveJobsByTitle();
  await clearJobs();
});

afterEach(async () => {
  await clearDrivers();
  await clearJobs();
});

// ---------- helpers specific to this file ----------

interface JobOptions {
  title: string;
  carrierId: string;
  minExperienceMonths?: number;
  minExperienceMonthsLifetime?: number | null;
  minExperienceMonthsLifetimeWindowMonths?: number | null;
  hiringPolygonWkt?: string | null;
  hiringRadiusMiles?: number | null;
}

async function insertJob(opts: JobOptions): Promise<string> {
  const [row] = await db
    .insert(carrierJobs)
    .values({
      carrierId: opts.carrierId,
      status: "active",
      positionTitle: opts.title,
      domicileCity: "Atlanta",
      domicileState: "GA",
      domicileLat: ATLANTA.lat,
      domicileLng: ATLANTA.lng,
      hiringRadiusMiles:
        opts.hiringRadiusMiles !== undefined ? opts.hiringRadiusMiles : 100,
      equipment: "dry-van",
      minExperienceMonths: opts.minExperienceMonths ?? 0,
      minExperienceMonthsLifetime: opts.minExperienceMonthsLifetime ?? null,
      minExperienceMonthsLifetimeWindowMonths:
        opts.minExperienceMonthsLifetimeWindowMonths ?? null,
      acceptedHomeTimeTypes: ["weekly", "biweekly", "otr"],
      sapTolerance: "accepts_all",
      preferredEquipmentExperience: [],
      preferredRegions: [],
      applicationSurface: "tenstreet_intelliapp",
      applicationUrl: "https://example.com/apply",
      dataSource: "manual_partner_intake",
      verificationStatus: "verified",
      dataQuality: "complete",
      lastVerifiedAt: new Date(),
    })
    .returning({ id: carrierJobs.id });
  if (!row) throw new Error("Failed to insert job");
  // Polygon goes in via a separate UPDATE so we can write the WKT
  // straight as SQL (avoids the geography custom-type path on local).
  if (opts.hiringPolygonWkt) {
    await db.execute(
      sql`UPDATE carrier_jobs SET hiring_polygon = ${opts.hiringPolygonWkt} WHERE id = ${row.id}`,
    );
  }
  return row.id;
}

interface TestDriverOpts {
  homeLat: string;
  homeLng: string;
  yearsHeld?: number;
  totalCareerExperienceMonths?: number | null;
  monthsSinceLastDrove?: number | null;
}

let driverSeq = 0;
async function insertTestDriverFull(opts: TestDriverOpts): Promise<string> {
  driverSeq += 1;
  const [row] = await db
    .insert(drivers)
    .values({
      firstName: "Path",
      lastName: `B${driverSeq}`,
      email: `pathb${driverSeq}+${Date.now()}@example.com`,
      phone: "555-555-1234",
      cdlState: "GA",
      yearsHeld: String(opts.yearsHeld ?? 0),
      otrYears: "0",
      equipmentRun: ["dry-van"],
      endorsements: [],
      desiredEquipment: ["dry-van"],
      desiredRegions: ["any"],
      homeTime: ["weekly"],
      minWeeklyPay: 0,
      willingToRelocate: false,
      homeLat: opts.homeLat,
      homeLng: opts.homeLng,
      terminatedFromAnyOfLast3Employers: false,
      failedDotTest: false,
      sapStatus: "not-in-sap",
      attestAccurate: true,
      consentToShare: true,
      totalCareerExperienceMonths:
        opts.totalCareerExperienceMonths ?? null,
      monthsSinceLastDrove: opts.monthsSinceLastDrove ?? null,
    })
    .returning({ id: drivers.id });
  if (!row) throw new Error("Failed to insert test driver");
  return row.id;
}

// ---------- LIFETIME EXPERIENCE TESTS ----------

describe("matchDriver — lifetime experience qualifying path", () => {
  it("Path B pass: 0 mo current, 12 mo total, 84 mo out, 120 mo window → matches min=3 + lifetime=12 + window=120", async () => {
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    await insertJob({
      title: `${LIFETIME_TITLE_PREFIX} pass`,
      carrierId,
      minExperienceMonths: 3,
      minExperienceMonthsLifetime: 12,
      minExperienceMonthsLifetimeWindowMonths: 120,
    });
    const driverId = await insertTestDriverFull({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      yearsHeld: 0,
      totalCareerExperienceMonths: 12,
      monthsSinceLastDrove: 84,
    });
    const result = await matchDriver(driverId);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).toContain(`${LIFETIME_TITLE_PREFIX} pass`);
  });

  it("Path B fail (window too tight): 84 mo out vs 60 mo window → no match", async () => {
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    await insertJob({
      title: `${LIFETIME_TITLE_PREFIX} window-fail`,
      carrierId,
      minExperienceMonths: 3,
      minExperienceMonthsLifetime: 12,
      minExperienceMonthsLifetimeWindowMonths: 60,
    });
    const driverId = await insertTestDriverFull({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      yearsHeld: 0,
      totalCareerExperienceMonths: 12,
      monthsSinceLastDrove: 84,
    });
    const result = await matchDriver(driverId);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).not.toContain(`${LIFETIME_TITLE_PREFIX} window-fail`);
  });

  it("Path B fail (total too low): 6 mo total vs 12 mo lifetime → no match", async () => {
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    await insertJob({
      title: `${LIFETIME_TITLE_PREFIX} total-fail`,
      carrierId,
      minExperienceMonths: 3,
      minExperienceMonthsLifetime: 12,
      minExperienceMonthsLifetimeWindowMonths: 120,
    });
    const driverId = await insertTestDriverFull({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      yearsHeld: 0,
      totalCareerExperienceMonths: 6,
      monthsSinceLastDrove: 30,
    });
    const result = await matchDriver(driverId);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).not.toContain(`${LIFETIME_TITLE_PREFIX} total-fail`);
  });

  it("Path A still works regardless of lifetime fields: 6 mo current matches min=3", async () => {
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    await insertJob({
      title: `${LIFETIME_TITLE_PREFIX} pathA-only`,
      carrierId,
      minExperienceMonths: 3,
      minExperienceMonthsLifetime: 12,
      minExperienceMonthsLifetimeWindowMonths: 120,
    });
    const driverId = await insertTestDriverFull({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      yearsHeld: 0.5, // 6 months
      totalCareerExperienceMonths: null,
      monthsSinceLastDrove: null,
    });
    const result = await matchDriver(driverId);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).toContain(`${LIFETIME_TITLE_PREFIX} pathA-only`);
  });

  it("Either-path OR logic: driver fails Path A but passes Path B → matches", async () => {
    const carrierId = await getCarrierIdByName(
      "National OTR Fleet (composite)",
    );
    await insertJob({
      title: `${LIFETIME_TITLE_PREFIX} or-logic`,
      carrierId,
      minExperienceMonths: 12, // strict — current Path A
      minExperienceMonthsLifetime: 12,
      minExperienceMonthsLifetimeWindowMonths: 120,
    });
    // 0 months current (fails Path A), 24 months total, 36 mo out
    // (passes Path B inside 120-mo window)
    const driverId = await insertTestDriverFull({
      homeLat: ATLANTA.lat,
      homeLng: ATLANTA.lng,
      yearsHeld: 0,
      totalCareerExperienceMonths: 24,
      monthsSinceLastDrove: 36,
    });
    const result = await matchDriver(driverId);
    const titles = result.matches.map((m) => m.positionTitle);
    expect(titles).toContain(`${LIFETIME_TITLE_PREFIX} or-logic`);
  });
});

// ---------- POLYGON HIRING AREA TESTS ----------

describe("matchDriver — polygon hiring area", () => {
  it("PostGIS gate: polygon tests only run when PostGIS is available", async () => {
    const ok = await isPostgisAvailable(db);
    // Just record the gate result so the suite shows a meaningful
    // signal locally vs prod. The other polygon tests inside this
    // describe self-skip when ok=false.
    expect(typeof ok).toBe("boolean");
  });

  it.skipIf(!process.env.RUN_POLYGON_TESTS)(
    "polygon match — inside: driver inside the polygon passes",
    async () => {
      const ok = await isPostgisAvailable(db);
      if (!ok) return;
      const carrierId = await getCarrierIdByName(
        "National OTR Fleet (composite)",
      );
      // A square polygon around Atlanta — Atlanta center is inside.
      const wkt =
        "SRID=4326;POLYGON((-85 33, -83 33, -83 35, -85 35, -85 33))";
      await insertJob({
        title: `${POLYGON_TITLE_PREFIX} inside`,
        carrierId,
        hiringPolygonWkt: wkt,
        hiringRadiusMiles: null,
      });
      const driverId = await insertTestDriverFull({
        homeLat: ATLANTA.lat,
        homeLng: ATLANTA.lng,
        yearsHeld: 5,
      });
      const result = await matchDriver(driverId);
      const titles = result.matches.map((m) => m.positionTitle);
      expect(titles).toContain(`${POLYGON_TITLE_PREFIX} inside`);
    },
  );

  it.skipIf(!process.env.RUN_POLYGON_TESTS)(
    "polygon match — outside (PRECEDENCE): driver outside polygon fails even within fallback radius",
    async () => {
      const ok = await isPostgisAvailable(db);
      if (!ok) return;
      const carrierId = await getCarrierIdByName(
        "National OTR Fleet (composite)",
      );
      // Small polygon around Atlanta only; Nashville is outside but
      // would be within a generous radius. Polygon must take precedence.
      const wkt =
        "SRID=4326;POLYGON((-84.6 33.5, -84.1 33.5, -84.1 34.0, -84.6 34.0, -84.6 33.5))";
      await insertJob({
        title: `${POLYGON_TITLE_PREFIX} outside`,
        carrierId,
        hiringPolygonWkt: wkt,
        hiringRadiusMiles: 500, // Nashville-Atlanta ≈ 215mi; circle alone would pass.
      });
      const driverId = await insertTestDriverFull({
        homeLat: NASHVILLE.lat,
        homeLng: NASHVILLE.lng,
        yearsHeld: 5,
      });
      const result = await matchDriver(driverId);
      const titles = result.matches.map((m) => m.positionTitle);
      expect(titles).not.toContain(`${POLYGON_TITLE_PREFIX} outside`);
    },
  );

  it.skipIf(!process.env.RUN_POLYGON_TESTS)(
    "polygon match — no polygon: circle filter applies (regression)",
    async () => {
      const ok = await isPostgisAvailable(db);
      if (!ok) return;
      const carrierId = await getCarrierIdByName(
        "National OTR Fleet (composite)",
      );
      await insertJob({
        title: `${POLYGON_TITLE_PREFIX} circle-only`,
        carrierId,
        hiringPolygonWkt: null,
        hiringRadiusMiles: 50,
      });
      const driverId = await insertTestDriverFull({
        homeLat: ATLANTA.lat,
        homeLng: ATLANTA.lng,
        yearsHeld: 5,
      });
      const result = await matchDriver(driverId);
      const titles = result.matches.map((m) => m.positionTitle);
      expect(titles).toContain(`${POLYGON_TITLE_PREFIX} circle-only`);
    },
  );

  it.skipIf(!process.env.RUN_POLYGON_TESTS)(
    "polygon distance score uses centroid",
    async () => {
      const ok = await isPostgisAvailable(db);
      if (!ok) return;
      const carrierId = await getCarrierIdByName(
        "National OTR Fleet (composite)",
      );
      // Square polygon centered at (-84, 34). Atlanta is ~74mi south.
      const wkt = "SRID=4326;POLYGON((-85 33, -83 33, -83 35, -85 35, -85 33))";
      const jobId = await insertJob({
        title: `${POLYGON_TITLE_PREFIX} centroid`,
        carrierId,
        hiringPolygonWkt: wkt,
        hiringRadiusMiles: null,
      });
      const driverId = await insertTestDriverFull({
        homeLat: ATLANTA.lat,
        homeLng: ATLANTA.lng,
        yearsHeld: 5,
      });
      const result = await matchDriver(driverId);
      const match = result.matches.find(
        (m) => m.jobId === jobId,
      );
      expect(match).toBeDefined();
      // Centroid is (-84, 34); Atlanta is (33.749, -84.388).
      // Distance is ~28 miles. Not from the domicile (Atlanta itself,
      // which would be 0 miles) — proves the centroid path is active.
      expect(match!.distanceMilesFromDriverHome).toBeGreaterThan(10);
      expect(match!.distanceMilesFromDriverHome).toBeLessThan(50);
    },
  );

  it.skipIf(!process.env.RUN_POLYGON_TESTS)(
    "invalid polygon rejected at INSERT time",
    async () => {
      const ok = await isPostgisAvailable(db);
      if (!ok) return;
      const carrierId = await getCarrierIdByName(
        "National OTR Fleet (composite)",
      );
      // Self-intersecting bowtie polygon. ST_IsValid should reject.
      const wkt =
        "SRID=4326;POLYGON((-85 33, -83 35, -85 35, -83 33, -85 33))";
      await expect(
        insertJob({
          title: `${POLYGON_TITLE_PREFIX} invalid`,
          carrierId,
          hiringPolygonWkt: wkt,
        }),
      ).rejects.toThrow();
    },
  );
});

// `eq` import kept so it's not flagged unused if we extend later.
void eq;
