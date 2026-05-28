// One-shot bulk-publish: push URL_UPDATED to Google Indexing API for
// every /job/* URL currently in the production sitemap.
//
// Why this exists: when we first deployed the 549 cycle URLs, the
// daily cron's Indexing API publish loop only fires on cycle STATE
// CHANGES (spawn / expire). Existing cycles sat there waiting for
// Google's crawler to find them via sitemap (3–7 days). This script
// push-notifies the API directly so they index within hours.
//
// Quota: Indexing API default is 200 requests/day. We publish in
// batches of 180 (small safety margin) and track which URLs have
// already been sent in /tmp/cdla-indexing-progress.json so re-runs
// across multiple days pick up where the last one left off.
//
// Usage (run once per day until done):
//   npx tsx scripts/bulk-publish-cycles.ts
//
// Prereqs:
//   - /tmp/gcp-key.json — the service-account JSON
//   - Service account is a Verified Owner of cdla.jobs in Search Console
//     (set up by scripts/_verify-sa-as-owner.ts)
//
// Progress file format:
//   { "publishedAt": ISO, "publishedUrls": ["https://...", ...] }
// Delete the file to start over.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SITEMAP_URL = "https://www.cdla.jobs/sitemap.xml";
const PROGRESS_PATH = "/tmp/cdla-indexing-progress.json";
const KEY_PATH = "/tmp/gcp-key.json";
const BATCH_LIMIT = 180; // Stays under 200/day default quota with margin

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

async function fetchSitemapUrls(): Promise<string[]> {
  const res = await fetch(`${SITEMAP_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`sitemap fetch ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>(https:\/\/www\.cdla\.jobs\/job\/[^<]+)<\/loc>/g)]
    .map((m) => m[1]);
}

async function main() {
  if (!existsSync(KEY_PATH)) {
    console.error(`✗ ${KEY_PATH} not found — re-create from GCP Service Account`);
    process.exit(1);
  }
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = readFileSync(KEY_PATH, "utf-8");

  const { publishIndexingNotification } = await import(
    "../src/lib/google-indexing"
  );

  const allUrls = await fetchSitemapUrls();
  console.log(`Sitemap has ${allUrls.length} /job/* URLs`);

  const progress = loadProgress();
  const alreadyPublished = new Set(progress.publishedUrls);
  const remaining = allUrls.filter((u) => !alreadyPublished.has(u));
  console.log(`  ${alreadyPublished.size} already published`);
  console.log(`  ${remaining.length} remaining`);

  if (remaining.length === 0) {
    console.log("");
    console.log("✓ All URLs already published. Nothing to do.");
    console.log(
      "  (Delete /tmp/cdla-indexing-progress.json if you want to re-publish from scratch.)",
    );
    process.exit(0);
  }

  const batch = remaining.slice(0, BATCH_LIMIT);
  console.log("");
  console.log(`Publishing batch of ${batch.length}…`);

  let published = 0;
  let failed = 0;
  const quotaErrors: string[] = [];

  for (let i = 0; i < batch.length; i++) {
    const url = batch[i];
    const r = await publishIndexingNotification(url, "URL_UPDATED");
    if (r.ok) {
      published++;
      progress.publishedUrls.push(url);
      // Save progress incrementally so a crash mid-batch doesn't lose state
      if (published % 20 === 0) {
        progress.publishedAt = new Date().toISOString();
        saveProgress(progress);
        console.log(`  ${published}/${batch.length} published…`);
      }
    } else {
      failed++;
      const err = r.error ?? "";
      // Quota error message is fairly stable; capture for the summary
      if (
        err.includes("429") ||
        err.toLowerCase().includes("quota") ||
        err.toLowerCase().includes("rate")
      ) {
        quotaErrors.push(err);
        console.error(`  ✗ quota exceeded at ${published + failed} of ${batch.length}`);
        break;
      }
      console.error(`  ✗ ${url} — ${err.slice(0, 100)}`);
    }
  }

  // Final save
  progress.publishedAt = new Date().toISOString();
  saveProgress(progress);

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log(`Published this run:  ${published}`);
  console.log(`Failed this run:     ${failed}`);
  console.log(`Total published:     ${progress.publishedUrls.length} / ${allUrls.length}`);
  console.log(`Remaining:           ${allUrls.length - progress.publishedUrls.length}`);
  console.log("");

  if (quotaErrors.length > 0) {
    console.log("Daily quota was reached. Re-run tomorrow to continue.");
  } else if (progress.publishedUrls.length < allUrls.length) {
    console.log("Batch limit reached. Re-run tomorrow for the next batch.");
  } else {
    console.log("✓ All cycle URLs notified. Google should index within ~6 hours each.");
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
