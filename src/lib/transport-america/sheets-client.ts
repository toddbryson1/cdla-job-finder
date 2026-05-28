// Google Sheets API client for the TA Dedicated sync.
//
// Uses the same service-account auth as @/lib/google-indexing
// (cdla-indexing@cdla-jobs-indexing.iam.gserviceaccount.com), but
// with the Sheets read-only scope.
//
// IMPORTANT — per spec §8 hard rules:
//   1. From the OPENINGS workbook, only read the "Dedicated Spreadsheet"
//      tab. Never read Waitlist (real driver names), Exclude From
//      Waitlist, BPI Relay, BPI Shuttle, or Teams.
//   2. From the DETAIL workbook, only read job tabs. Never sync the
//      policy tabs (Hiring Guidelines, Time out of the truck,
//      Passenger Policy, Pet Policy) as jobs.
//
// Both rules are enforced in code below — the openings reader
// explicitly names the tab; the detail reader skips known policy tabs
// by name match.

import crypto from "node:crypto";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"].join(
  " ",
);

const OPENINGS_SHEET_ID = "1RvMEx9a9UJqeR8LExtdsoZ5U3eJi0UxLDkDJJlSZjjY";
const DETAIL_WORKBOOK_ID = "19DyBjnq9odA-pQr2bCuKJYiOrQodiUcZMYyu4aUaN10";

const OPENINGS_TAB_NAME = "Dedicated Spreadsheet";

// Per spec §7: policy tabs that exist in the detail workbook and
// must NEVER be synced as jobs.
const POLICY_TAB_NAMES = new Set([
  "Hiring Guidelines",
  "Time out of the truck",
  "Passenger Policy",
  "Pet Policy",
]);

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  private_key_id: string;
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

function loadServiceAccount(): ServiceAccountKey {
  const raw = process.env.GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY;
  if (!raw) {
    throw new Error(
      "GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY not set — the TA sync reuses the same service-account key as the Indexing API",
    );
  }
  return JSON.parse(raw) as ServiceAccountKey;
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
  const input = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claim))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(input);
  signer.end();
  return `${input}.${base64url(signer.sign(sa.private_key))}`;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const sa = loadServiceAccount();
  const assertion = signJwt(sa);
  const res = await fetch(
    sa.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`token exchange ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

interface CellValue {
  text: string | null;
  /** True if the cell's background is grey (per §4 "filled" signal). */
  isGreyShaded: boolean;
}

interface SheetGrid {
  rows: CellValue[][];
}

// Sheets API has two read quotas:
//   - 300 reads/min per project (rarely a problem)
//   - 60 reads/min PER USER — and the service account counts as one
//     user, so this is the binding constraint
//
// 1100ms throttle = ~55 req/min, safely under 60. Scanning 163 tabs
// takes ~3 minutes, but the result is cached for the rest of the
// daily sync (we read every tab once at the top of runFullSync).
const SHEETS_READ_THROTTLE_MS = 1100;
let lastReadAt = 0;
async function rateLimit(): Promise<void> {
  const elapsed = Date.now() - lastReadAt;
  const wait = SHEETS_READ_THROTTLE_MS - elapsed;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastReadAt = Date.now();
}

/**
 * Read the openings sheet's "Dedicated Spreadsheet" tab WITH cell
 * background formatting so we can detect grey-shaded (filled) rows
 * per §4.
 *
 * Returns raw cell grid; the caller (parse-openings) decides which
 * columns mean what.
 */
export async function readOpeningsTab(): Promise<SheetGrid> {
  const token = await getAccessToken();
  // We need cell values AND background color, so we use
  // spreadsheets.get with includeGridData=true and fields filter
  // to only the openings tab.
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${OPENINGS_SHEET_ID}`,
  );
  url.searchParams.set("ranges", OPENINGS_TAB_NAME);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set(
    "fields",
    "sheets(data(rowData(values(formattedValue,effectiveFormat.backgroundColor))))",
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`readOpeningsTab ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    sheets?: Array<{
      data?: Array<{
        rowData?: Array<{
          values?: Array<{
            formattedValue?: string;
            effectiveFormat?: {
              backgroundColor?: {
                red?: number;
                green?: number;
                blue?: number;
              };
            };
          }>;
        }>;
      }>;
    }>;
  };

  const rowsRaw = json.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const rows: CellValue[][] = rowsRaw.map(
    (r) =>
      r.values?.map((v) => ({
        text: v.formattedValue ?? null,
        isGreyShaded: isGreyBackground(
          v.effectiveFormat?.backgroundColor ?? {},
        ),
      })) ?? [],
  );
  return { rows };
}

/**
 * Detect "grey" by RGB proximity to a neutral mid-grey. Google Sheets
 * stores backgrounds as floats 0..1; default white is (1,1,1).
 * "Filled" rows in the openings sheet typically use a light grey
 * around (0.85, 0.85, 0.85). We accept anything where R≈G≈B and
 * value is in [0.5, 0.95] — covers light grey through medium grey.
 */
function isGreyBackground(bg: {
  red?: number;
  green?: number;
  blue?: number;
}): boolean {
  const r = bg.red ?? 1;
  const g = bg.green ?? 1;
  const b = bg.blue ?? 1;
  // Channel spread — if R, G, B aren't roughly equal, it's a tint, not grey
  const spread = Math.max(
    Math.abs(r - g),
    Math.abs(g - b),
    Math.abs(r - b),
  );
  if (spread > 0.08) return false;
  const avg = (r + g + b) / 3;
  return avg >= 0.5 && avg <= 0.95;
}

/**
 * List every tab name in the detail workbook. We use this to:
 *   1. Filter out the policy tabs per §7
 *   2. Run the fuzzy match against the remaining job tab names
 */
export async function listDetailTabNames(): Promise<{
  jobTabs: string[];
  policyTabs: string[];
}> {
  const token = await getAccessToken();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${DETAIL_WORKBOOK_ID}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`listDetailTabNames ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as {
    sheets?: Array<{ properties: { title: string } }>;
  };
  const all = (json.sheets ?? []).map((s) => s.properties.title);
  const jobTabs: string[] = [];
  const policyTabs: string[] = [];
  for (const t of all) {
    if (POLICY_TAB_NAMES.has(t)) policyTabs.push(t);
    else jobTabs.push(t);
  }
  return { jobTabs, policyTabs };
}

/**
 * Read the cell values from one specific detail tab.
 *
 * Uses spreadsheets.get with includeGridData=true, scoped to the
 * named tab. We tried /values/{range} first, but it sometimes
 * returns 0 rows even when the tab clearly has content (suspected:
 * Sheets API special handling of tab names with hyphens / commas /
 * trailing whitespace, or quote-escaping rules for A1 notation).
 * The .get endpoint with includeGridData treats the tab name as a
 * range identifier without A1 parsing and works consistently.
 */
export async function readDetailTab(tabName: string): Promise<SheetGrid> {
  if (POLICY_TAB_NAMES.has(tabName)) {
    throw new Error(
      `Refusing to read policy tab "${tabName}" — per spec §8, policy tabs are never synced as jobs`,
    );
  }
  await rateLimit();
  const token = await getAccessToken();
  const url = new URL(
    `https://sheets.googleapis.com/v4/spreadsheets/${DETAIL_WORKBOOK_ID}`,
  );
  url.searchParams.set("ranges", tabName);
  url.searchParams.set("includeGridData", "true");
  url.searchParams.set(
    "fields",
    "sheets(data(rowData(values(formattedValue))))",
  );
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `readDetailTab "${tabName}" ${res.status}: ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    sheets?: Array<{
      data?: Array<{
        rowData?: Array<{
          values?: Array<{ formattedValue?: string }>;
        }>;
      }>;
    }>;
  };
  const rowsRaw = json.sheets?.[0]?.data?.[0]?.rowData ?? [];
  const rows: CellValue[][] = rowsRaw.map(
    (r) =>
      r.values?.map((v) => ({
        text: v.formattedValue ?? null,
        isGreyShaded: false,
      })) ?? [],
  );
  return { rows };
}

/**
 * Read every job tab once and return the names + parsed grid for tabs
 * that have actual content. Empty/abandoned tabs are dropped so they
 * don't pollute the fuzzy-match candidate set.
 *
 * Rate-limited (250ms/req) to stay under Sheets API quota when
 * scanning ~160 tabs (~40s total wall time).
 */
/**
 * True if this tab has actual content (vs. an empty stub). We define
 * "populated" as at least 5 non-empty cells across the whole tab —
 * enough to suggest someone wrote real fields here. Tabs with 1-2
 * stray edits get filtered out as still-essentially-empty.
 */
function isTabPopulated(grid: SheetGrid): boolean {
  let nonEmpty = 0;
  for (const row of grid.rows) {
    for (const cell of row) {
      if (cell.text && cell.text.trim().length > 0) {
        nonEmpty++;
        if (nonEmpty >= 5) return true;
      }
    }
  }
  return false;
}

export async function readAllPopulatedTabs(): Promise<
  Array<{ tabName: string; grid: SheetGrid }>
> {
  const { jobTabs } = await listDetailTabNames();
  const out: Array<{ tabName: string; grid: SheetGrid }> = [];
  for (const tabName of jobTabs) {
    try {
      const grid = await readDetailTab(tabName);
      if (isTabPopulated(grid)) {
        out.push({ tabName, grid });
      }
    } catch (e) {
      // Don't let one bad tab kill the whole pass. Log and continue.
      console.warn(
        `[ta-sync] readDetailTab(${tabName}) failed: ${e instanceof Error ? e.message : e}`,
      );
    }
  }
  return out;
}

export { OPENINGS_SHEET_ID, DETAIL_WORKBOOK_ID, POLICY_TAB_NAMES };
export type { CellValue, SheetGrid };
