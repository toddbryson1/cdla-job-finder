// One-off direct publish of Anderson's 12 cycles to the Google Indexing
// API, bypassing the prod sitemap because Vercel's edge cache is stuck
// well past the ISR revalidate window.
//
// Queries prod DB for active Anderson cycles + carrier name, builds the
// /job/[slug] URL with buildJobPostingSlug (same builder the sitemap
// uses, so when the edge cache eventually expires the URLs match), and
// pushes each as URL_UPDATED via publishIndexingNotification. Records
// each pushed URL in /tmp/cdla-indexing-progress.json so a future
// bulk-publish run doesn't double-send.
//
// Run via:
//   . /tmp/cdla-prod-env && npx tsx scripts/_push-anderson-direct.ts
//
// Prereqs:
//   - /tmp/cdla-prod-env exporting DATABASE_URL
//   - /tmp/gcp-key.json (service-account JSON)

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const PROGRESS_PATH = "/tmp/cdla-indexing-progress.json";
const KEY_PATH = "/tmp/gcp-key.json";
const SITE_ORIGIN = "https://www.cdla.jobs";

interface Progress {
  publishedAt: string | null;
  publishedUrls: string[];
}

function loadProgress(): Progress {
  if (!existsSync(PROGRESS_PATH)) {
    return { publishedAt: null, publishedUrls: [] };
  }
  return JSON.parse(readFileSync(PROGRESS_PATH, "utf-8"));
}

function saveProgress(p: Progress): void {
  writeFileSync(PROGRESS_PATH, JSON.stringify(p, null, 2));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set — source /tmp/cdla-prod-env first");
    process.exit(1);
  }
  if (!existsSync(KEY_PATH)) {
    console.error(`✗ ${KEY_PATH} not found — restore the GCP service-account JSON`);
    process.exit(1);
  }
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(
    KEY_PATH,
    "utf-8",
  );

  const { db } = await import("../src/db/client");
  const { carrierJobs, carriers, jobPostingCycles } = await import(
    "../src/db/schema"
  );
  const { buildJobPostingSlug } = await import("../src/lib/job-slug");
  const { publishIndexingNotification } = await import(
    "../src/lib/google-indexing"
  );
  const { and, eq, like } = await import("drizzle-orm");

  const rows = await db
    .select({
      cycleId: jobPostingCycles.id,
      city: jobPostingCycles.city,
      state: jobPostingCycles.state,
      isPrimary: jobPostingCycles.isPrimary,
      positionTitle: carrierJobs.positionTitle,
      domicileCity: carrierJobs.domicileCity,
      domicileState: carrierJobs.domicileState,
      externalSourceId: carrierJobs.externalSourceId,
      carrierName: carriers.name,
    })
    .from(jobPostingCycles)
    .innerJoin(carrierJobs, eq(carrierJobs.id, jobPostingCycles.jobId))
    .innerJoin(carriers, eq(carriers.id, carrierJobs.carrierId))
    .where(
      and(
        eq(jobPostingCycles.status, "active"),
        eq(carrierJobs.status, "active"),
        like(carrierJobs.externalSourceId, "anderson:csv:%"),
      ),
    );

  console.log(`Anderson cycle rows: ${rows.length}`);
  if (rows.length === 0) {
    console.error("No Anderson cycles found — did the importer run?");
    process.exit(1);
  }

  const urls = rows.map((r) => ({
    url: `${SITE_ORIGIN}/job/${buildJobPostingSlug(
      { name: r.carrierName },
      {
        id: r.cycleId,
        positionTitle: r.positionTitle,
        domicileCity: r.city,
        domicileState: r.state,
      },
    )}`,
    isPrimary: r.isPrimary,
    title: r.positionTitle,
    city: r.city,
    state: r.state,
  }));

  console.log("");
  console.log("URLs to publish:");
  for (const u of urls) {
    console.log(`  ${u.isPrimary ? "P" : " "} ${u.url}`);
  }

  const progress = loadProgress();
  const alreadyPublished = new Set(progress.publishedUrls);
  const remaining = urls.filter((u) => !alreadyPublished.has(u.url));
  console.log("");
  console.log(`  ${urls.length - remaining.length} already published`);
  console.log(`  ${remaining.length} to push`);

  if (remaining.length === 0) {
    console.log("\n✓ All Anderson URLs already published. Nothing to do.");
    process.exit(0);
  }

  console.log("");
  console.log("Publishing…");
  let published = 0;
  let failed = 0;
  for (const u of remaining) {
    const r = await publishIndexingNotification(u.url, "URL_UPDATED");
    if (r.ok) {
      published++;
      progress.publishedUrls.push(u.url);
      console.log(`  ✓ ${u.title} — ${u.city}, ${u.state}`);
    } else {
      failed++;
      console.error(`  ✗ ${u.url} — ${r.error?.slice(0, 120) ?? "unknown"}`);
    }
  }

  progress.publishedAt = new Date().toISOString();
  saveProgress(progress);

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log(`Published: ${published}`);
  console.log(`Failed:    ${failed}`);
  console.log(`Progress file: ${progress.publishedUrls.length} URLs total`);
  console.log("");
  console.log("✓ Done. Google typically indexes within ~6 hours of notification.");
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
