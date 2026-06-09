// Google Indexing API client.
//
// Google for Jobs is crawler-driven, but for JobPosting-eligible URLs
// Google provides an Indexing API that lets us push notifications:
//
//   POST https://indexing.googleapis.com/v3/urlNotifications:publish
//   { url, type: "URL_UPDATED" | "URL_DELETED" }
//
// We call URL_UPDATED when a new posting cycle spawns and URL_DELETED
// when one expires. That gets fresh URLs into Google within hours
// instead of waiting for the natural recrawl. Critical for our model:
// each posting only lives 20 days, so if it takes 7 days to index,
// we waste 35% of the window.
//
// Per Google's docs the Indexing API is *only* approved for two URL
// types: JobPosting and BroadcastEvent. Using it for other content
// risks getting the key revoked. Every URL we publish here resolves
// to a /job/[slug] page that carries JobPosting JSON-LD.
//
// Quota: 200 requests/day baseline, raised on request once you've
// proven you're using it for JobPosting. Use batch endpoint when
// publishing many at once to amortize quota.
//
// Setup (one-time, user-facing):
//   1. Verify cdla.jobs in Google Search Console (HTML meta tag via
//      GOOGLE_SITE_VERIFICATION env var, or DNS TXT).
//   2. Create a GCP project at console.cloud.google.com.
//   3. Enable the "Indexing API" on that project.
//   4. Create a service account → JSON key. Download it.
//   5. In Search Console → Settings → Users and permissions, add the
//      service account email as an "Owner" of the cdla.jobs property.
//   6. Set GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY in Vercel env vars to
//      the full JSON contents (single line, base64 NOT required).
//   7. In Search Console → Sitemaps, submit https://cdla.jobs/sitemap.xml
//
// Refs:
//   https://developers.google.com/search/apis/indexing-api/v3/quickstart
//   https://developers.google.com/search/docs/appearance/structured-data/job-posting

import {
  getGoogleAccessToken,
  isServiceAccountConfigured,
} from "./google-auth";

const INDEXING_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

/**
 * True iff GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY is present and parseable.
 * Spawner uses this to skip publish/delete steps cleanly when the
 * Indexing API isn't configured (e.g., local dev).
 */
export function isIndexingApiConfigured(): boolean {
  return isServiceAccountConfigured();
}

export type IndexingNotificationType = "URL_UPDATED" | "URL_DELETED";

export interface PublishResult {
  ok: boolean;
  url: string;
  type: IndexingNotificationType;
  /** Only set when ok=false. */
  error?: string;
}

/**
 * Notify Google that a URL has been added/updated or removed.
 *
 * Non-throwing — callers (the spawner) shouldn't fail their main work
 * if the Indexing API has a hiccup. The result is logged and returned
 * so cron summaries can show success/failure counts.
 */
export async function publishIndexingNotification(
  url: string,
  type: IndexingNotificationType,
): Promise<PublishResult> {
  if (!isIndexingApiConfigured()) {
    return {
      ok: false,
      url,
      type,
      error: "Indexing API not configured (no service account key)",
    };
  }
  try {
    const token = await getGoogleAccessToken(SCOPE);
    const res = await fetch(INDEXING_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url, type }),
      // Don't block the cron forever if Google's slow.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        url,
        type,
        error: `Indexing publish ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true, url, type };
  } catch (err) {
    return {
      ok: false,
      url,
      type,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Publish many URLs in series with a small concurrency cap. We don't
 * use Google's batch endpoint (it requires multipart/mixed framing
 * which is heavyweight for our scale) — sequential POSTs are fine for
 * the daily-cron volume (~tens to low-hundreds of notifications/day).
 */
export async function publishIndexingNotifications(
  notifications: Array<{ url: string; type: IndexingNotificationType }>,
): Promise<{ sent: number; failed: number; results: PublishResult[] }> {
  const results: PublishResult[] = [];
  for (const n of notifications) {
    results.push(await publishIndexingNotification(n.url, n.type));
  }
  const sent = results.filter((r) => r.ok).length;
  return { sent, failed: results.length - sent, results };
}
