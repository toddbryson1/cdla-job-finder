// Test Google Sheets API access against both TA sheets.
// Identifies which is openings vs detail by tab count + names.
//
// Failures distinguished:
//   - SHEETS_API_DISABLED: enable at console.cloud.google.com/apis/library/sheets.googleapis.com
//   - SHARE_MISSING: service account isn't shared on the sheet (returns 403)
//   - OK: auth + share both work, returns tab names

import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const SHEETS = [
  {
    label: "Sheet A",
    id: "1RvMEx9a9UJqeR8LExtdsoZ5U3eJi0UxLDkDJJlSZjjY",
  },
  {
    label: "Sheet B",
    id: "19DyBjnq9odA-pQr2bCuKJYiOrQodiUcZMYyu4aUaN10",
  },
];

const SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

function base64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

interface SA {
  client_email: string;
  private_key: string;
  private_key_id: string;
  token_uri?: string;
}

function signJwt(sa: SA): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: sa.private_key_id };
  const claim = {
    iss: sa.client_email,
    scope: SCOPE,
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${base64url(signer.sign(sa.private_key))}`;
}

async function getAccessToken(sa: SA): Promise<string> {
  const assertion = signJwt(sa);
  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  return (await res.json()).access_token;
}

async function getSheetMetadata(
  accessToken: string,
  sheetId: string,
): Promise<{
  ok: boolean;
  title?: string;
  tabs?: string[];
  error?: string;
}> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=properties.title,sheets.properties.title`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const text = await res.text();
  if (!res.ok) {
    if (text.includes("SERVICE_DISABLED") || text.includes("accessNotConfigured")) {
      return {
        ok: false,
        error:
          "SHEETS_API_DISABLED — enable at console.cloud.google.com/apis/library/sheets.googleapis.com?project=cdla-jobs-indexing",
      };
    }
    if (res.status === 403) {
      return {
        ok: false,
        error: `SHARE_MISSING — share this sheet with cdla-indexing@cdla-jobs-indexing.iam.gserviceaccount.com as Viewer`,
      };
    }
    if (res.status === 404) {
      return { ok: false, error: `NOT_FOUND — sheet ID may be wrong` };
    }
    return { ok: false, error: `${res.status}: ${text.slice(0, 200)}` };
  }
  const json = JSON.parse(text);
  return {
    ok: true,
    title: json.properties?.title,
    tabs: json.sheets?.map((s: { properties: { title: string } }) => s.properties.title),
  };
}

async function main() {
  const sa = JSON.parse(readFileSync("/tmp/gcp-key.json", "utf-8")) as SA;
  console.log(`Service account: ${sa.client_email}`);

  const token = await getAccessToken(sa);
  console.log("✓ Got access token (Sheets scope)");
  console.log("");

  for (const sheet of SHEETS) {
    console.log(`── ${sheet.label} (${sheet.id}) ──`);
    const meta = await getSheetMetadata(token, sheet.id);
    if (!meta.ok) {
      console.log(`  ✗ ${meta.error}`);
      console.log("");
      continue;
    }
    console.log(`  Title: ${meta.title}`);
    console.log(`  Tabs (${meta.tabs?.length ?? 0}):`);
    for (const t of (meta.tabs ?? []).slice(0, 8)) {
      console.log(`    - ${t}`);
    }
    if ((meta.tabs?.length ?? 0) > 8) {
      console.log(`    ...and ${(meta.tabs?.length ?? 0) - 8} more`);
    }
    // Heuristic: openings sheet has ~5-10 tabs and one is "Dedicated Spreadsheet"
    // Detail workbook has ~50 tabs, each one named for a job/account
    const tabs = meta.tabs ?? [];
    const looksLikeOpenings = tabs.some(
      (t) => t.toLowerCase().includes("dedicated") && t.toLowerCase().includes("spreadsheet"),
    );
    const looksLikeDetail = tabs.length >= 30;
    if (looksLikeOpenings) console.log(`  → Identified: OPENINGS sheet`);
    else if (looksLikeDetail) console.log(`  → Identified: DETAIL workbook`);
    else console.log(`  → Identified: unclear`);
    console.log("");
  }
}

main().catch((e) => {
  console.error("Failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
