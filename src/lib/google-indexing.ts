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

import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const INDEXING_URL =
  "https://indexing.googleapis.com/v3/urlNotifications:publish";
const SCOPE = "https://www.googleapis.com/auth/indexing";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  token_uri?: string;
}

interface AccessToken {
  token: string;
  expiresAt: number; // ms epoch
}

let cachedToken: AccessToken | null = null;

/**
 * True iff GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY is present and parseable.
 * Spawner uses this to skip publish/delete steps cleanly when the
 * Indexing API isn't configured (e.g., local dev).
 */
export function isIndexingApiConfigured(): boolean {
  const raw = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  if (!raw) return false;
  try {
    const sa = JSON.parse(raw) as ServiceAccountKey;
    return Boolean(sa.private_key && sa.client_email);
  } catch {
    return false;
  }
}

function loadServiceAccount(): ServiceAccountKey {
  const raw = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error("GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY is not set");
  }
  const sa = JSON.parse(raw) as ServiceAccountKey;
  if (!sa.private_key || !sa.client_email) {
    throw new Error(
      "Service account JSON missing private_key or client_email",
    );
  }
  return sa;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Sign a JWT with the service account's RSA private key (RS256) per
 * Google's OAuth 2.0 service-account flow. Returns the assertion we
 * exchange for an access token at /token.
 */
function signJwt(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? TOKEN_URL,
    iat: now,
    exp: now + 3600, // max lifetime per Google's docs
  };
  const headerB64 = base64url(JSON.stringify(header));
  const claimB64 = base64url(JSON.stringify(claim));
  const signingInput = `${headerB64}.${claimB64}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(sa.private_key);
  return `${signingInput}.${base64url(signature)}`;
}

/**
 * Exchange a signed JWT for an access token. Cached in module scope
 * with a safety margin so consecutive publishes don't each round-trip.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const sa = loadServiceAccount();
  const assertion = signJwt(sa);

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const res = await fetch(sa.token_uri ?? TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
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
    const token = await getAccessToken();
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
