// Tests for the posting-cycle spawner.
// postingCycleIdPrefixFromSlug is pure; spawnPostingCycles hits the
// DB so it runs as integration against the local schema.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { carrierJobs, jobPostingCycles } from "@/db/schema";
import {
  postingCycleIdPrefixFromSlug,
  spawnPostingCycles,
} from "@/lib/posting-cycles";

async function getSeedCarrierId(): Promise<string> {
  const c = await db.query.carriers.findFirst({
    where: (cs, { eq }) => eq(cs.name, "Atlanta Reefer Co (composite)"),
  });
  if (!c) throw new Error("Seed carrier missing");
  return c.id;
}

async function insertTestJob(extras: Partial<typeof carrierJobs.$inferInsert> = {}) {
  const carrierId = await getSeedCarrierId();
  const [row] = await db
    .insert(carrierJobs)
    .values({
      carrierId,
      status: "active",
      positionTitle: `TEST cycles ${Date.now()}-${Math.random()}`,
      domicileCity: "Phoenix",
      domicileState: "AZ",
      domicileLat: "33.448400",
      domicileLng: "-112.074000",
      hiringRadiusMiles: 100,
      equipment: "dry-van",
      acceptedHomeTimeTypes: ["weekly"],
      ...extras,
    })
    .returning();
  return row;
}

async function deleteTestJobs() {
  await db.execute(
    sql`DELETE FROM carrier_jobs WHERE position_title LIKE 'TEST cycles %'`,
  );
}

describe("posting-cycles.postingCycleIdPrefixFromSlug", () => {
  it("extracts the 8-char hex prefix at the end of the slug", () => {
    expect(
      postingCycleIdPrefixFromSlug(
        "swift-transportation-otr-dry-van-driver-phoenix-az-a1b2c3d4",
      ),
    ).toBe("a1b2c3d4");
  });

  it("is case-insensitive (hex is normalized to lowercase)", () => {
    expect(
      postingCycleIdPrefixFromSlug("foo-bar-A1B2C3D4"),
    ).toBe("a1b2c3d4");
  });

  it("returns null when no trailing hex prefix", () => {
    expect(postingCycleIdPrefixFromSlug("foo-bar-baz")).toBeNull();
  });

  it("returns null when prefix is shorter than 8 chars", () => {
    expect(postingCycleIdPrefixFromSlug("foo-a1b2c3")).toBeNull();
  });

  it("returns null when prefix is longer than 8 chars", () => {
    // The trailing-dash split treats this as one chunk; 9 chars isn't 8
    expect(postingCycleIdPrefixFromSlug("foo-a1b2c3d4e")).toBeNull();
  });

  it("returns null when the prefix contains non-hex chars", () => {
    expect(postingCycleIdPrefixFromSlug("foo-z1b2c3d4")).toBeNull();
    expect(postingCycleIdPrefixFromSlug("foo-a1b2c3g4")).toBeNull();
  });

  it("returns null when slug has no dashes", () => {
    expect(postingCycleIdPrefixFromSlug("a1b2c3d4")).toBeNull();
  });
});

describe("posting-cycles.spawnPostingCycles", () => {
  afterEach(async () => {
    await deleteTestJobs();
  });

  it("spawns a primary cycle for a new active job", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 100,
    });
    const result = await spawnPostingCycles(db);
    expect(result.spawned).toBeGreaterThan(0);

    const cycles = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    expect(cycles.length).toBeGreaterThan(0);
    const primary = cycles.find((c) => c.isPrimary);
    expect(primary).toBeTruthy();
    expect(primary?.status).toBe("active");
  });

  it("spawns up to TARGET_CITIES_PER_JOB (3) cycles per job in one pass", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 200,
    });
    await spawnPostingCycles(db);
    const cycles = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    // Up to 3; could be fewer if zip_codes doesn't have 3 cities
    // satisfying the 50mi spacing rule within the radius.
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    expect(cycles.length).toBeLessThanOrEqual(3);
  });

  it("sets expires_at = posted_at + 20 days", async () => {
    const job = await insertTestJob();
    await spawnPostingCycles(db);
    const cycles = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    for (const c of cycles) {
      const diffMs =
        new Date(c.expiresAt).getTime() - new Date(c.postedAt).getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      // Allow 1 day tolerance for UTC date arithmetic
      expect(diffDays).toBeGreaterThan(19);
      expect(diffDays).toBeLessThan(21);
    }
  });

  it("rotates variant_index across spawned cycles", async () => {
    const job = await insertTestJob({
      domicileCity: "Phoenix",
      domicileState: "AZ",
      hiringRadiusMiles: 200,
    });
    await spawnPostingCycles(db);
    const cycles = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    if (cycles.length >= 2) {
      // At least two different variant indexes among the spawned set
      const variants = new Set(cycles.map((c) => c.variantIndex));
      expect(variants.size).toBeGreaterThan(1);
    }
  });

  it("does NOT spawn additional cycles when job already has target count", async () => {
    const job = await insertTestJob();
    await spawnPostingCycles(db); // first run
    const before = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    // Second pass should be a no-op for this job (cool-down + target met)
    const result2 = await spawnPostingCycles(db);
    const after = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    expect(after.length).toBe(before.length);
    // jobsTouched counts only jobs that got NEW cycles; this job
    // should not be in that count.
    expect(result2.jobsTouched).toBe(0);
  });

  it("expires active cycles past their expires_at", async () => {
    const job = await insertTestJob();
    // Manually insert an already-expired cycle
    await db.insert(jobPostingCycles).values({
      jobId: job.id,
      city: "Phoenix",
      state: "AZ",
      cycleIndex: 1,
      variantIndex: 0,
      isPrimary: true,
      postedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // expired 1 day ago
      status: "active",
    });

    const result = await spawnPostingCycles(db);
    expect(result.expired).toBeGreaterThanOrEqual(1);

    const cycle = await db.query.jobPostingCycles.findFirst({
      where: eq(jobPostingCycles.jobId, job.id),
    });
    expect(cycle?.status).toBe("expired");
  });

  it("respects the 3-day cool-down — won't spawn if most-recent cycle is <3 days old", async () => {
    const job = await insertTestJob();
    // Insert a single recent active cycle (1 day old)
    await db.insert(jobPostingCycles).values({
      jobId: job.id,
      city: "Phoenix",
      state: "AZ",
      cycleIndex: 1,
      variantIndex: 0,
      isPrimary: true,
      postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 19 * 24 * 60 * 60 * 1000),
      status: "active",
    });
    const before = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    await spawnPostingCycles(db);
    const after = await db
      .select()
      .from(jobPostingCycles)
      .where(eq(jobPostingCycles.jobId, job.id));
    expect(after.length).toBe(before.length); // no new cycles
  });

  it("sets indexingSkipped=true when GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY is not set", async () => {
    // Ensure env var isn't set during the test
    const original = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
    try {
      await insertTestJob();
      const result = await spawnPostingCycles(db);
      if (result.spawned > 0 || result.expired > 0) {
        // Only meaningful when there's something to publish
        expect(result.indexingSkipped).toBe(true);
        expect(result.indexingPublished).toBe(0);
      }
    } finally {
      if (original !== undefined) {
        process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = original;
      }
    }
  });
});
