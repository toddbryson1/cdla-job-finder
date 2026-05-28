// Make the GCP service account a Verified Owner of cdla.jobs.
//
// Google's Search Console UI sometimes rejects service account emails
// in the Add User flow with "email not found." The documented
// workaround is to have the service account verify domain ownership
// of itself, using the Site Verification API. After this runs, the
// service account is registered with Google as a verified domain
// owner, and the Indexing API will accept publishes from it.
//
// Two steps:
//   1. Ask Google for a verification token for the service account
//      (POST /siteVerification/v1/token). Google returns a DNS TXT
//      value like google-site-verification=xyz123.
//   2. Verify (POST /siteVerification/v1/webResource). Google checks
//      DNS for the TXT record and, if found, registers the service
//      account as a verified owner.
//
// Between 1 and 2, the user must add the TXT record to DNS and wait
// for propagation. The script polls dig until it sees the record,
// then automatically continues to step 2.
//
// Prereq: Site Verification API must be enabled in the GCP project.
// We auto-detect "API not enabled" and tell the user how to enable it.

import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const SCOPES = [
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/indexing",
].join(" ");
const DOMAIN = "cdla.jobs";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  token_uri?: string;
}

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(sa: ServiceAccountKey): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: SCOPES,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  return `${signingInput}.${base64url(signer.sign(sa.private_key))}`;
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const assertion = signJwt(sa);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const json = (await res.json()) as { access_token: string };
  return json.access_token;
}

async function getVerificationToken(
  accessToken: string,
): Promise<{ token: string }> {
  const res = await fetch(
    "https://www.googleapis.com/siteVerification/v1/token",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        site: { identifier: DOMAIN, type: "INET_DOMAIN" },
        verificationMethod: "DNS_TXT",
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    if (text.includes("accessNotConfigured") || text.includes("disabled")) {
      console.error("");
      console.error(
        "✗ Site Verification API is not enabled in the GCP project.",
      );
      console.error(
        "  Open: https://console.cloud.google.com/apis/library/siteverification.googleapis.com?project=cdla-jobs-indexing",
      );
      console.error("  Click ENABLE, then re-run this script.");
      process.exit(1);
    }
    throw new Error(`getVerificationToken failed (${res.status}): ${text}`);
  }
  return JSON.parse(text) as { token: string };
}

async function pollDnsForToken(token: string): Promise<void> {
  const target = `google-site-verification=${token}`;
  console.log("");
  console.log(`Polling DNS for: ${target}`);
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const out = execSync(`dig +short TXT ${DOMAIN}`, {
        encoding: "utf-8",
      });
      if (out.includes(token)) {
        console.log(`  ✓ DNS shows the verification record (attempt ${attempt})`);
        return;
      }
      console.log(`  attempt ${attempt}: not yet, retrying in 10s…`);
    } catch {
      console.log(`  attempt ${attempt}: dig failed, retrying in 10s…`);
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error(
    "DNS record never appeared after 5 minutes. Check GoDaddy DNS panel.",
  );
}

async function claimOwnership(accessToken: string): Promise<void> {
  const res = await fetch(
    "https://www.googleapis.com/siteVerification/v1/webResource?verificationMethod=DNS_TXT",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        site: { identifier: DOMAIN, type: "INET_DOMAIN" },
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`claim ownership failed (${res.status}): ${text}`);
  }
  console.log("");
  console.log("✓ Ownership claimed. Service account is now a Verified Owner of cdla.jobs.");
}

async function testIndexingPublish(accessToken: string): Promise<void> {
  console.log("");
  console.log("Testing Indexing API publish…");
  const res = await fetch(
    "https://indexing.googleapis.com/v3/urlNotifications:publish",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: "https://www.cdla.jobs/job/atlanta-reefer-co-otr-cdl-a-reefer-driver-atlanta-terminal-atlanta-ga-5e7a1c59",
        type: "URL_UPDATED",
      }),
    },
  );
  const text = await res.text();
  if (res.ok) {
    console.log("  ✓ 200 — Indexing API accepted the notification");
    console.log("  The full Indexing API path is now live.");
  } else {
    console.log(`  ✗ ${res.status} — ${text.slice(0, 200)}`);
  }
}

async function main() {
  const sa = JSON.parse(
    readFileSync("/tmp/gcp-key.json", "utf-8"),
  ) as ServiceAccountKey;
  console.log(`Service account: ${sa.client_email}`);
  console.log(`Project: ${sa.project_id}`);
  console.log(`Domain: ${DOMAIN}`);
  console.log("");

  const accessToken = await getAccessToken(sa);
  console.log("✓ Got access token");

  const { token } = await getVerificationToken(accessToken);
  // Google returns the FULL TXT record value (already includes the
  // "google-site-verification=" prefix), so we use it as-is.
  console.log("");
  console.log("Google returned a verification token. Add this TXT record:");
  console.log("");
  console.log("  Type:  TXT");
  console.log(`  Name:  @  (or leave blank — apex of ${DOMAIN})`);
  console.log(`  Value: ${token}`);
  console.log("  TTL:   600");
  console.log("");
  console.log(
    `Add at https://dcc.godaddy.com/manage/${DOMAIN}/dns — REPLACE the existing google-site-verification TXT record (the one ending in '0OE').`,
  );
  console.log(
    "(Why replace: the existing one was for the URL prefix property's verification. The service account needs its own distinct token.)",
  );
  console.log("");
  console.log("Script will poll DNS and continue automatically once it sees the new record…");

  await pollDnsForToken(token);
  await claimOwnership(accessToken);
  await testIndexingPublish(accessToken);
}

main().catch((e) => {
  console.error("");
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
