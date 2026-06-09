// Unit tests for the GSC URL Inspection call. We can't hit Google in a
// unit test, so we mock fetch and verify: not-configured short-circuits,
// the token exchange carries the read-only Search Console scope, the
// inspection POST hits the right endpoint with the right body, and
// coverageState is parsed out of the response.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import crypto from "node:crypto";
import { callUrlInspectionApi } from "@/lib/content-machine/gsc";

function makeServiceAccountKey(): string {
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  return JSON.stringify({
    type: "service_account",
    project_id: "test",
    private_key_id: "kid-gsc",
    private_key: privateKey,
    client_email: "sa@test.iam.gserviceaccount.com",
    client_id: "123",
  });
}

function decodeJwtScope(assertion: string): string {
  const payload = assertion.split(".")[1];
  const json = JSON.parse(
    Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf-8",
    ),
  );
  return json.scope;
}

describe("callUrlInspectionApi", () => {
  const ORIGINAL_FETCH = global.fetch;
  const ORIGINAL_KEY = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;

  beforeEach(() => {
    global.fetch = ORIGINAL_FETCH;
    delete process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  });
  afterEach(() => {
    global.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_KEY === undefined)
      delete process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
    else process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = ORIGINAL_KEY;
  });

  it("returns ok=false when the service account is not configured", async () => {
    const r = await callUrlInspectionApi("https://cdla.jobs/articles/foo");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("not configured");
  });

  it("inspects a URL and parses coverageState", async () => {
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = makeServiceAccountKey();

    let inspectionBody: unknown = null;
    let exchangeScope: string | null = null;

    global.fetch = (async (input: unknown, init?: { body?: string }) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        const params = new URLSearchParams(init!.body);
        exchangeScope = decodeJwtScope(params.get("assertion")!);
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      if (url.includes("searchconsole.googleapis.com")) {
        inspectionBody = JSON.parse(init!.body!);
        return new Response(
          JSON.stringify({
            inspectionResult: {
              indexStatusResult: { coverageState: "Submitted and indexed" },
            },
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as unknown as typeof fetch;

    const r = await callUrlInspectionApi("https://cdla.jobs/articles/foo");

    expect(r.ok).toBe(true);
    expect(r.coverageState).toBe("Submitted and indexed");
    expect(exchangeScope).toBe(
      "https://www.googleapis.com/auth/webmasters.readonly",
    );
    expect(inspectionBody).toEqual({
      inspectionUrl: "https://cdla.jobs/articles/foo",
      siteUrl: "https://cdla.jobs/",
    });
  });

  it("returns ok=false on a non-2xx inspection response", async () => {
    process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY = makeServiceAccountKey();
    global.fetch = (async (input: unknown) => {
      const url = String(input);
      if (url.includes("oauth2.googleapis.com/token")) {
        return new Response(
          JSON.stringify({ access_token: "tok", expires_in: 3600 }),
          { status: 200 },
        );
      }
      return new Response("forbidden", { status: 403 });
    }) as unknown as typeof fetch;

    const r = await callUrlInspectionApi("https://cdla.jobs/articles/bar");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("403");
  });
});
