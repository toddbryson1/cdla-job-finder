// Debug: see what the Sheets API actually returns for a detail tab.

import { readFileSync } from "node:fs";
import crypto from "node:crypto";

const KEY = JSON.parse(readFileSync("/tmp/gcp-key.json", "utf-8"));
const SHEET_ID = "19DyBjnq9odA-pQr2bCuKJYiOrQodiUcZMYyu4aUaN10";
const TAB = "3M Aberdeen SD";

function b64u(s: string | Buffer): string {
  return (typeof s === "string" ? Buffer.from(s) : s)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function main() {
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: KEY.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: "RS256", typ: "JWT", kid: KEY.private_key_id };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  const jwt = `${input}.${b64u(signer.sign(KEY.private_key))}`;

  const tokRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });
  const token = (await tokRes.json()).access_token;

  // Try several read approaches and see which work.
  // Approach 1: GET /values/<tab>
  const u1 = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(TAB)}`;
  const r1 = await fetch(u1, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`\n--- Approach 1: /values/${TAB} ---`);
  console.log(`status: ${r1.status}`);
  console.log(`body: ${(await r1.text()).slice(0, 500)}`);

  // Approach 2: GET /values/'<tab>'!A1:Z100 (A1 quoted)
  const u2 = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${TAB}'!A1:Z100`)}`;
  const r2 = await fetch(u2, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`\n--- Approach 2: /values/'${TAB}'!A1:Z100 ---`);
  console.log(`status: ${r2.status}`);
  console.log(`body: ${(await r2.text()).slice(0, 500)}`);

  // Approach 3: spreadsheets.get with ranges + includeGridData
  const u3 = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`);
  u3.searchParams.set("ranges", TAB);
  u3.searchParams.set("includeGridData", "true");
  const r3 = await fetch(u3, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`\n--- Approach 3: spreadsheets.get?ranges=${TAB}&includeGridData=true ---`);
  console.log(`status: ${r3.status}`);
  const text3 = await r3.text();
  console.log(`body length: ${text3.length}`);
  console.log(`body first 800: ${text3.slice(0, 800)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
