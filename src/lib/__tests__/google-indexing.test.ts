// Dry-run for the Google Indexing API client.
//
// We can't actually call indexing.googleapis.com in a unit test, but
// the failure mode that scares me is the JWT signing — RS256 against a
// PEM-encoded private key, base64url encoding, claim shape per Google's
// OAuth2 service-account spec. If any of that is wrong, every call to
// the real API will fail with "Invalid JWT Signature" or a similar
// opaque error, AFTER we've handed Google a real key.
//
// This test:
//   1. Generates a fresh RSA-2048 keypair in-process
//   2. Stubs process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY with a
//      synthetic service-account JSON pointing at the test private key
//   3. Stubs global fetch — the OAuth token endpoint returns a fake
//      access_token, the publish endpoint returns 200
//   4. Calls publishIndexingNotification
//   5. Captures the JWT assertion the client sent to the token endpoint
//   6. Verifies the JWT decodes, claims look right, and the RS256
//      signature is valid against the *public* key
//
// If this passes we know the client will produce a structurally valid
// OAuth assertion when pointed at real credentials. The only thing
// left to verify in prod is "the service account has Search Console
// Owner permission" — which is a Search Console UI concern, not code.

import { beforeEach, describe, expect, it, vi } from "vitest";
import crypto from "node:crypto";
import {
  isIndexingApiConfigured,
  publishIndexingNotification,
} from "../google-indexing";

function generateTestKeypair(): { privateKey: string; publicKey: string } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return { privateKey, publicKey };
}

interface DecodedJwt {
  header: Record<string, unknown>;
  payload: Record<string, unknown>;
  signature: Buffer;
  signingInput: string;
}

function decodeJwt(jwt: string): DecodedJwt {
  const [h, p, s] = jwt.split(".");
  const fromB64url = (s: string): Buffer =>
    Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return {
    header: JSON.parse(fromB64url(h).toString("utf-8")),
    payload: JSON.parse(fromB64url(p).toString("utf-8")),
    signature: fromB64url(s),
    signingInput: `${h}.${p}`,
  };
}

describe("google-indexing", () => {
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_KEY = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;

  beforeEach(() => {
    delete process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
    global.fetch = ORIGINAL_FETCH;
  });

  it("isIndexingApiConfigured returns false when env var missing", () => {
    expect(isIndexingApiConfigured()).toBe(false);
  });

  it("isIndexingApiConfigured returns false on malformed JSON", () => {
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = "{not-json";
    expect(isIndexingApiConfigured()).toBe(false);
  });

  it("isIndexingApiConfigured returns false when private_key missing", () => {
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: "x@y.iam.gserviceaccount.com",
    });
    expect(isIndexingApiConfigured()).toBe(false);
  });

  it("isIndexingApiConfigured returns true when both fields present", () => {
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = JSON.stringify({
      client_email: "x@y.iam.gserviceaccount.com",
      private_key: "irrelevant for this check",
    });
    expect(isIndexingApiConfigured()).toBe(true);
  });

  it("publishIndexingNotification returns ok=false when not configured", async () => {
    const r = await publishIndexingNotification(
      "https://cdla.jobs/job/foo",
      "URL_UPDATED",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not configured");
  });

  it("signs a valid RS256 JWT, exchanges for token, posts notification", async () => {
    // Setup: real keypair + service-account JSON pointing at it.
    const { privateKey, publicKey } = generateTestKeypair();
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "kid-deadbeef",
      private_key: privateKey,
      client_email: "test-indexer@test-project.iam.gserviceaccount.com",
      client_id: "12345",
      token_uri: "https://oauth2.googleapis.com/token",
    });

    // Capture the JWT assertion the client sends to the token endpoint.
    let capturedAssertion: string | undefined;
    let capturedPublishBody: unknown;

    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("oauth2.googleapis.com/token")) {
        // Body is application/x-www-form-urlencoded with "assertion=..."
        const params = new URLSearchParams(String(init?.body ?? ""));
        capturedAssertion = params.get("assertion") ?? undefined;
        return new Response(
          JSON.stringify({
            access_token: "fake-access-token",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (url.includes("indexing.googleapis.com")) {
        capturedPublishBody = JSON.parse(String(init?.body ?? "{}"));
        // Echo Google's success response shape
        return new Response(
          JSON.stringify({
            urlNotificationMetadata: {
              url: "https://cdla.jobs/job/foo",
              latestUpdate: {
                url: "https://cdla.jobs/job/foo",
                type: "URL_UPDATED",
                notifyTime: new Date().toISOString(),
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch;

    const result = await publishIndexingNotification(
      "https://cdla.jobs/job/foo",
      "URL_UPDATED",
    );

    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://cdla.jobs/job/foo");
    expect(result.type).toBe("URL_UPDATED");

    // Token endpoint got hit with an assertion
    expect(capturedAssertion).toBeTruthy();
    const jwt = decodeJwt(capturedAssertion!);

    // Header — RS256 + kid
    expect(jwt.header.alg).toBe("RS256");
    expect(jwt.header.typ).toBe("JWT");
    expect(jwt.header.kid).toBe("kid-deadbeef");

    // Claims — issuer, audience, scope, sane iat/exp
    expect(jwt.payload.iss).toBe(
      "test-indexer@test-project.iam.gserviceaccount.com",
    );
    expect(jwt.payload.aud).toBe("https://oauth2.googleapis.com/token");
    expect(jwt.payload.scope).toBe(
      "https://www.googleapis.com/auth/indexing",
    );
    const iat = Number(jwt.payload.iat);
    const exp = Number(jwt.payload.exp);
    const now = Math.floor(Date.now() / 1000);
    expect(iat).toBeGreaterThan(now - 5);
    expect(iat).toBeLessThanOrEqual(now);
    expect(exp).toBe(iat + 3600);

    // Signature verifies against the public key
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(jwt.signingInput);
    verifier.end();
    expect(verifier.verify(publicKey, jwt.signature)).toBe(true);

    // Publish call body matches Google's expected shape
    expect(capturedPublishBody).toEqual({
      url: "https://cdla.jobs/job/foo",
      type: "URL_UPDATED",
    });

    // Restore
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = ORIGINAL_KEY;
  });

  it("returns ok=false when token endpoint 401s", async () => {
    const { privateKey } = generateTestKeypair();
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "kid",
      private_key: privateKey,
      client_email: "test@test.iam.gserviceaccount.com",
      client_id: "1",
    });
    global.fetch = vi.fn(async () => {
      return new Response('{"error":"invalid_grant"}', { status: 401 });
    }) as typeof fetch;
    const r = await publishIndexingNotification(
      "https://cdla.jobs/job/x",
      "URL_DELETED",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Token exchange|401/i);
  });

  it("returns ok=false when indexing endpoint 403s", async () => {
    const { privateKey } = generateTestKeypair();
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = JSON.stringify({
      type: "service_account",
      project_id: "test-project",
      private_key_id: "kid",
      private_key: privateKey,
      client_email: "test@test.iam.gserviceaccount.com",
      client_id: "1",
    });
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("oauth2.googleapis.com")) {
        return new Response(
          JSON.stringify({ access_token: "fake", expires_in: 3600 }),
          { status: 200 },
        );
      }
      // Indexing call returns 403 (this is what happens when the
      // service account is not an Owner of the Search Console property)
      return new Response('{"error":{"code":403,"message":"Permission denied"}}', {
        status: 403,
      });
    }) as typeof fetch;
    const r = await publishIndexingNotification(
      "https://cdla.jobs/job/x",
      "URL_UPDATED",
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/403/);
  });
});
