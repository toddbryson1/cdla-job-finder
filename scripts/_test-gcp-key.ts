// One-shot test of the GCP service-account key against the real
// Google Indexing API. Tests two things:
//   1. JWT exchange — does Google accept our signed assertion?
//      Failure here means the key itself is bad or the API isn't enabled.
//   2. Indexing publish — does Google accept a URL_UPDATED notification?
//      403 here means JWT works but the service account isn't an Owner
//      on the Search Console property yet (add at search.google.com →
//      Settings → Users and permissions → Owner).
//
// Picks one real /job URL from the sitemap to use as the publish target
// so we can verify end-to-end without inventing URLs.

import { readFileSync } from "node:fs";

async function main() {
  const keyJson = readFileSync("/tmp/gcp-key.json", "utf-8");
  process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = keyJson;

  const { publishIndexingNotification, isIndexingApiConfigured } =
    await import("../src/lib/google-indexing");

  console.log(
    "isIndexingApiConfigured():",
    isIndexingApiConfigured() ? "✓ yes" : "✗ no",
  );

  // Grab a real cycle URL from the live sitemap
  const sitemap = await fetch(
    `https://www.cdla.jobs/sitemap.xml?t=${Date.now()}`,
  ).then((r) => r.text());
  const urlMatch = sitemap.match(/<loc>(https:\/\/www\.cdla\.jobs\/job\/[^<]+)<\/loc>/);
  if (!urlMatch) {
    console.error("✗ no /job/ URL found in prod sitemap; can't test publish");
    process.exit(1);
  }
  const testUrl = urlMatch[1];
  console.log(`Test target: ${testUrl}`);
  console.log("");
  console.log("Publishing URL_UPDATED notification…");
  const result = await publishIndexingNotification(testUrl, "URL_UPDATED");
  if (result.ok) {
    console.log("");
    console.log("✓ Google accepted the notification.");
    console.log("  - Auth: JWT signed correctly, exchange succeeded.");
    console.log(
      "  - Permission: service account is recognized as a Search Console Owner.",
    );
    console.log("  - The Indexing API path is ready for production.");
    process.exit(0);
  } else {
    console.log("");
    console.log("✗ Notification rejected:");
    console.log(`  ${result.error}`);
    if (result.error?.includes("403") || result.error?.includes("Permission")) {
      console.log("");
      console.log("403 = JWT works, but the service account is not an Owner");
      console.log("of the Search Console property. Fix:");
      console.log("  1. Open search.google.com/search-console");
      console.log("  2. Property: https://www.cdla.jobs/");
      console.log("  3. Settings → Users and permissions → Add user");
      console.log(
        "  4. Email: cdla-indexing@cdla-jobs-indexing.iam.gserviceaccount.com",
      );
      console.log("  5. Permission: Owner (NOT 'Full')");
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
