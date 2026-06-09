// Shared Google service-account auth (JWT → OAuth2 access token).
//
// Extracted from google-indexing.ts so multiple Google APIs can share
// one service-account key and the same token-exchange path, each asking
// for its own scope:
//   - Indexing API            → .../auth/indexing        (google-indexing.ts)
//   - Search Console / URL Inspection → .../auth/webmasters.readonly (content-machine/gsc.ts)
//   - Sheets (TA sync)        → reuses the same key
//
// The service account JSON lives in GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY
// (named for its first consumer; reused for all of the above). Tokens are
// cached per-scope with a safety margin so repeated calls don't each
// round-trip the token endpoint.

import crypto from "node:crypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SA_ENV = "GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY";

export interface ServiceAccountKey {
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

// Per-scope token cache. Keyed by scope so the indexing and webmasters
// tokens don't evict each other.
const tokenCache = new Map<string, AccessToken>();

/** True iff the service-account key is present and parseable. */
export function isServiceAccountConfigured(): boolean {
  const raw = process.env[SA_ENV];
  if (!raw) return false;
  try {
    const sa = JSON.parse(raw) as ServiceAccountKey;
    return Boolean(sa.private_key && sa.client_email);
  } catch {
    return false;
  }
}

export function loadServiceAccount(): ServiceAccountKey {
  const raw = process.env[SA_ENV];
  if (!raw) {
    throw new Error(`${SA_ENV} is not set`);
  }
  const sa = JSON.parse(raw) as ServiceAccountKey;
  if (!sa.private_key || !sa.client_email) {
    throw new Error("Service account JSON missing private_key or client_email");
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
 * Google's OAuth 2.0 service-account flow, scoped to `scope`.
 */
function signJwt(sa: ServiceAccountKey, scope: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope,
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
 * Exchange a signed JWT for an access token for `scope`. Cached per-scope
 * with a 60s safety margin so consecutive calls don't each round-trip.
 */
export async function getGoogleAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }
  const sa = loadServiceAccount();
  const assertion = signJwt(sa, scope);

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
  const token: AccessToken = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  tokenCache.set(scope, token);
  return token.token;
}
