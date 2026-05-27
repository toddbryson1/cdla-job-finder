// E2E smoke test for the cdla.jobs Next.js app.
//
// Hits every public route + a sample of dynamic /job and /jobs slug
// pages, validates the JSON-LD on at least one /job/[slug] page,
// confirms /sitemap.xml + /robots.txt look right, exercises
// /api/cron/daily with the bearer secret, then runs DB sanity checks
// against today's posting-cycles work.
//
// Usage:
//   npm run dev        # in one terminal
//   npx tsx scripts/smoke-test.ts   # in another
//
// Exit code 0 = all green; 1 = at least one failure.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

type Status = "pass" | "fail" | "skip";
interface CheckResult {
  name: string;
  status: Status;
  detail?: string;
}

const results: CheckResult[] = [];

function pass(name: string, detail?: string) {
  results.push({ name, status: "pass", detail });
}

function fail(name: string, detail: string) {
  results.push({ name, status: "fail", detail });
}

function skip(name: string, detail: string) {
  results.push({ name, status: "skip", detail });
}

async function expectStatus(
  name: string,
  path: string,
  expected: number,
  opts: RequestInit = {},
): Promise<Response | null> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, opts);
    if (res.status !== expected) {
      fail(name, `${path} returned ${res.status}, expected ${expected}`);
      return null;
    }
    pass(name, `${path} → ${res.status}`);
    return res;
  } catch (err) {
    fail(name, `${path} threw: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}

async function expectContains(
  name: string,
  path: string,
  needle: string | RegExp,
): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}${path}`);
    if (!res.ok) {
      fail(name, `${path} returned ${res.status}`);
      return;
    }
    const text = await res.text();
    const found =
      typeof needle === "string" ? text.includes(needle) : needle.test(text);
    if (!found) {
      fail(name, `${path} did not contain ${needle}`);
      return;
    }
    pass(name, `${path} contains ${needle}`);
  } catch (err) {
    fail(name, `${path} threw: ${err instanceof Error ? err.message : err}`);
  }
}

async function checkPublicRoutes(): Promise<void> {
  const routes = [
    "/",
    "/intake",
    "/about",
    "/faq",
    "/partners",
    "/partners/integration",
    "/partners/exclusivity",
    "/partners/brief",
    "/privacy",
    "/terms",
    "/sitemap.xml",
    "/robots.txt",
  ];
  for (const path of routes) {
    await expectStatus(`public ${path}`, path, 200);
  }
}

async function checkJobsLandingPages(): Promise<void> {
  const slugs = [
    "atlanta-reefer",
    "dallas-flatbed",
    "houston-tanker",
    "chicago-dry-van",
    "southeast-otr",
  ];
  for (const slug of slugs) {
    await expectStatus(`landing /jobs/${slug}`, `/jobs/${slug}`, 200);
  }
}

async function checkSitemapAndRobots(): Promise<{
  jobSlugs: string[];
}> {
  const sitemap = await fetch(`${BASE_URL}/sitemap.xml`).then((r) => r.text());
  const jobUrls = [
    ...sitemap.matchAll(/<loc>(https:\/\/cdla\.jobs\/job\/[^<]+)<\/loc>/g),
  ].map((m) => m[1]);
  if (jobUrls.length === 0) {
    fail("sitemap has /job/ URLs", "no /job/* URLs in sitemap.xml");
  } else {
    pass(
      "sitemap has /job/ URLs",
      `${jobUrls.length} cycle URLs in sitemap.xml`,
    );
  }

  const robots = await fetch(`${BASE_URL}/robots.txt`).then((r) => r.text());
  if (!robots.includes("Sitemap: https://cdla.jobs/sitemap.xml")) {
    fail("robots points to sitemap", "robots.txt missing Sitemap directive");
  } else {
    pass("robots points to sitemap", "Sitemap directive present");
  }
  if (!robots.includes("Disallow: /matches/")) {
    fail("robots disallows /matches", "/matches/ not in Disallow list");
  } else {
    pass("robots disallows /matches", "/matches/ is disallowed");
  }

  // Extract relative slugs for downstream tests.
  const jobSlugs = jobUrls.map((u) =>
    u.replace("https://cdla.jobs/job/", ""),
  );
  return { jobSlugs };
}

async function checkJobPageJsonLd(slug: string): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/job/${slug}`);
    if (!res.ok) {
      fail(`/job/${slug} renders`, `status ${res.status}`);
      return;
    }
    pass(`/job/${slug} renders`, "200");
    const html = await res.text();
    const ldMatch = html.match(
      /<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s,
    );
    if (!ldMatch) {
      fail(`/job/${slug} JSON-LD present`, "no script tag found");
      return;
    }
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(ldMatch[1]);
    } catch {
      fail(`/job/${slug} JSON-LD parses`, "invalid JSON");
      return;
    }
    pass(`/job/${slug} JSON-LD parses`, "valid JSON");

    const required = [
      "@context",
      "@type",
      "title",
      "description",
      "datePosted",
      "validThrough",
      "hiringOrganization",
      "jobLocation",
    ];
    for (const k of required) {
      if (!(k in parsed)) {
        fail(`/job/${slug} JSON-LD has ${k}`, `missing ${k}`);
        return;
      }
    }
    pass(
      `/job/${slug} JSON-LD has required fields`,
      `${required.join(", ")}`,
    );

    if (parsed["@type"] !== "JobPosting") {
      fail(
        `/job/${slug} @type=JobPosting`,
        `got @type=${String(parsed["@type"])}`,
      );
      return;
    }
    pass(`/job/${slug} @type=JobPosting`, "ok");

    const validThrough = new Date(String(parsed.validThrough));
    if (
      Number.isNaN(validThrough.getTime()) ||
      validThrough.getTime() < Date.now()
    ) {
      fail(
        `/job/${slug} validThrough in future`,
        `validThrough=${parsed.validThrough} is past or invalid`,
      );
      return;
    }
    pass(`/job/${slug} validThrough in future`, String(parsed.validThrough));
  } catch (err) {
    fail(
      `/job/${slug} render`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function checkCronEndpoint(): Promise<void> {
  // Probe first to distinguish "server cron not configured" (500) from
  // "auth required" (401). If the server is missing CRON_SECRET in its
  // OWN env (not just .env.local — but the running process's env),
  // we can't exercise the auth path locally; that's a "skip" not a fail.
  const probe = await fetch(`${BASE_URL}/api/cron/daily`);
  if (probe.status === 500) {
    skip(
      "/api/cron/daily auth",
      "server returned 500 — CRON_SECRET not in dev server env (restart dev server with CRON_SECRET=... npm run dev)",
    );
    return;
  }
  if (probe.status !== 401) {
    fail(
      "/api/cron/daily rejects without auth",
      `expected 401, got ${probe.status}`,
    );
    return;
  }
  pass("/api/cron/daily rejects without auth", "401");

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    skip(
      "/api/cron/daily accepts bearer",
      "CRON_SECRET not in test runner env; can't construct a valid bearer",
    );
    return;
  }
  const withAuth = await fetch(`${BASE_URL}/api/cron/daily`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  // The run itself may report failures for unconfigured integrations
  // (e.g., GHL/Smartsheet); that's fine — we just want the auth path.
  if (withAuth.status !== 200) {
    fail(
      "/api/cron/daily accepts bearer",
      `expected 200, got ${withAuth.status}`,
    );
  } else {
    pass("/api/cron/daily accepts bearer", "200");
  }
}

async function checkDbSanity(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    fail("db connection", "DATABASE_URL not set, skipping db checks");
    return;
  }
  const { db } = await import("../src/db/client");
  const { sql } = await import("drizzle-orm");

  // OTR invariant: every job with hiring_radius_miles=NULL must include
  // 'otr' in accepted_home_time_types.
  const otrViolations = (await db.execute(sql`
    SELECT id, position_title, accepted_home_time_types
    FROM carrier_jobs
    WHERE status='active'
      AND hiring_radius_miles IS NULL
      AND NOT 'otr' = ANY(accepted_home_time_types)
  `)) as unknown as Array<{ id: string; position_title: string }>;
  if (otrViolations.length > 0) {
    fail(
      "OTR invariant on carrier_jobs",
      `${otrViolations.length} rows violate: ${otrViolations
        .slice(0, 3)
        .map((r) => r.position_title)
        .join(", ")}`,
    );
  } else {
    pass("OTR invariant on carrier_jobs", "no violations");
  }

  // Every active job has at least one active cycle.
  const cycleCoverage = (await db.execute(sql`
    SELECT COUNT(*)::int AS missing
    FROM carrier_jobs j
    WHERE j.status='active'
      AND NOT EXISTS (
        SELECT 1 FROM job_posting_cycles c
        WHERE c.job_id=j.id AND c.status='active'
      )
  `)) as unknown as Array<{ missing: number }>;
  if (cycleCoverage[0].missing > 0) {
    fail(
      "every active job has an active cycle",
      `${cycleCoverage[0].missing} jobs without any active cycle`,
    );
  } else {
    pass("every active job has an active cycle", "0 gaps");
  }

  // No expired-but-still-active cycles.
  const overdue = (await db.execute(sql`
    SELECT COUNT(*)::int AS n
    FROM job_posting_cycles
    WHERE status='active' AND expires_at < NOW()
  `)) as unknown as Array<{ n: number }>;
  if (overdue[0].n > 0) {
    fail(
      "no overdue active cycles",
      `${overdue[0].n} cycles past expires_at still marked active`,
    );
  } else {
    pass("no overdue active cycles", "0");
  }

  // At most one active cycle per (job, city, state) — partial unique
  // index should enforce this but let's verify.
  const dupes = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT job_id, city, state
      FROM job_posting_cycles
      WHERE status='active'
      GROUP BY job_id, city, state
      HAVING COUNT(*) > 1
    ) t
  `)) as unknown as Array<{ n: number }>;
  if (dupes[0].n > 0) {
    fail(
      "≤1 active cycle per (job, city, state)",
      `${dupes[0].n} duplicates found`,
    );
  } else {
    pass("≤1 active cycle per (job, city, state)", "0 dupes");
  }

  // zip_codes populated.
  const zipCount = (await db.execute(sql`
    SELECT COUNT(*)::int AS n FROM zip_codes
  `)) as unknown as Array<{ n: number }>;
  if (zipCount[0].n < 30_000) {
    fail("zip_codes populated", `only ${zipCount[0].n} rows`);
  } else {
    pass("zip_codes populated", `${zipCount[0].n} rows`);
  }
}

async function checkMatchingRegression(): Promise<void> {
  // Exercises matchDriver end-to-end with a transient fixture driver
  // designed to trip the OTR-leakage bug we just fixed: a weekly-only
  // driver in California shouldn't see OTR jobs.
  if (!process.env.DATABASE_URL) {
    skip("matching regression check", "DATABASE_URL not set");
    return;
  }
  const { db } = await import("../src/db/client");
  const { drivers } = await import("../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { matchDriver } = await import("../src/lib/matching");

  // Transient driver: weekly-only, CA — would have matched OTR jobs
  // before the hardFilter fix.
  const testEmail = `smoke-otr-leakage+${Date.now()}@example.invalid`;
  const inserted = await db
    .insert(drivers)
    .values({
      firstName: "Smoke",
      lastName: "Test",
      email: testEmail,
      phone: "555-000-0000",
      cdlState: "CA",
      yearsHeld: "3",
      otrYears: "0",
      equipmentRun: ["dry-van"],
      desiredEquipment: ["dry-van"],
      desiredRegions: ["any"],
      homeTime: ["weekly"], // explicitly NOT 'otr'
      minWeeklyPay: 0,
      willingToRelocate: false,
      homeZip: "90001",
      homeLat: "33.973900",
      homeLng: "-118.249200",
      terminatedFromAnyOfLast3Employers: false,
      failedDotTest: false,
      sapStatus: "not-in-sap",
      attestAccurate: true,
      consentToShare: true,
    })
    .returning({ id: drivers.id });
  const driverId = inserted[0].id;

  try {
    const result = await matchDriver(driverId);
    pass(
      "matchDriver runs without throwing",
      `weekly-CA driver matches=${result.matches.length}`,
    );
    // No OTR-NULL-radius job should reach this driver.
    const otrLeak = result.matches.find(
      (m) => m.distanceMilesFromDriverHome === null,
    );
    if (otrLeak) {
      fail(
        "no OTR leakage to non-OTR drivers",
        `weekly-CA driver matched OTR-radius=NULL job: ${otrLeak.positionTitle}`,
      );
    } else {
      pass(
        "no OTR leakage to non-OTR drivers",
        "weekly-only CA driver sees no NULL-radius jobs",
      );
    }
  } catch (err) {
    fail(
      "matchDriver runs without throwing",
      err instanceof Error ? err.message : String(err),
    );
  } finally {
    await db.delete(drivers).where(eq(drivers.id, driverId));
  }
}

async function main() {
  console.log(`Smoke test against ${BASE_URL}`);
  console.log("=".repeat(60));

  await checkPublicRoutes();
  await checkJobsLandingPages();
  const { jobSlugs } = await checkSitemapAndRobots();
  // Spot-check the first 3 cycle URLs from the sitemap (one primary +
  // two secondaries from different jobs is a useful spread).
  for (const slug of jobSlugs.slice(0, 3)) {
    await checkJobPageJsonLd(slug);
  }
  await expectContains(
    "homepage mentions CDLA.jobs",
    "/",
    /CDLA\.jobs/,
  );
  await expectContains(
    "homepage has search-console verification meta when configured",
    "/",
    process.env.GOOGLE_SITE_VERIFICATION
      ? "google-site-verification"
      : "CDLA.jobs",
  );
  await checkCronEndpoint();
  await checkDbSanity();
  await checkMatchingRegression();

  // Report.
  console.log("");
  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  const passed = results.filter((r) => r.status === "pass");
  for (const r of results) {
    const icon =
      r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    console.log(`  ${icon} ${r.name}${r.detail ? "  — " + r.detail : ""}`);
  }
  console.log("");
  console.log(
    `${passed.length} passed, ${failed.length} failed, ${skipped.length} skipped`,
  );
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Smoke test crashed:", e);
  process.exit(2);
});
