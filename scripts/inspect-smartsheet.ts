import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

// One-shot inspection script: prints the Smartsheet sheet's structure
// (name, total rows, columns + types) without dumping any row data, so
// we can design the carrier_jobs sync without exposing personal info in
// the terminal.
//
// Usage:
//   npx tsx scripts/inspect-smartsheet.ts <sheet-token-or-id>
//
// The token is the long string in app.smartsheet.com/sheets/<token>.
// Smartsheet's v2 API accepts both numeric sheetId and the URL token.

const apiKey = process.env.SMARTSHEET_API_KEY;
if (!apiKey) {
  console.error(
    "SMARTSHEET_API_KEY is not set. Add it to .env.local (see .env.example).",
  );
  process.exit(1);
}

const sheetArg = process.argv[2];
if (!sheetArg) {
  console.error("Usage: tsx scripts/inspect-smartsheet.ts <sheet-token-or-id>");
  process.exit(1);
}

const BASE = "https://api.smartsheet.com/2.0";

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    const err = body as { message?: string; errorCode?: number } | null;
    const code = err?.errorCode ?? res.status;
    const message = err?.message ?? text;
    throw new Error(`Smartsheet ${path} → ${code}: ${message}`);
  }
  return body as T;
}

interface SheetColumn {
  id: number;
  title: string;
  type: string;
  primary?: boolean;
  options?: string[];
  validation?: boolean;
}

interface Sheet {
  id: number;
  name: string;
  totalRowCount: number;
  columns: SheetColumn[];
  permalink?: string;
}

interface SheetList {
  data: Array<{ id: number; name: string; permalink: string }>;
}

async function resolveSheetId(token: string): Promise<number> {
  // First try the token as-is — modern API accepts URL tokens directly
  // on /sheets/{id}.
  try {
    const direct = await api<Sheet>(`/sheets/${token}?pageSize=1`);
    return direct.id;
  } catch (err) {
    const msg = String(err);
    if (!/4(04|00)/.test(msg)) throw err;
  }

  // Fallback: list every sheet the key can see and match by permalink.
  const sheets = await api<SheetList>("/sheets?includeAll=true");
  const match = sheets.data.find((s) => s.permalink.includes(token));
  if (!match) {
    throw new Error(
      `Could not resolve sheet for token ${token}. The API key may not have access to this sheet, or the token has rotated.`,
    );
  }
  return match.id;
}

async function main() {
  console.log(`Resolving sheet: ${sheetArg}`);
  const sheetId = await resolveSheetId(sheetArg);
  console.log(`Numeric sheetId: ${sheetId}`);

  // pageSize=1 gets us metadata + columns + a single row's structure
  // without dumping all the data.
  const sheet = await api<Sheet & { rows?: unknown[] }>(
    `/sheets/${sheetId}?pageSize=1`,
  );

  console.log("\n=== Sheet ===");
  console.log("Name        :", sheet.name);
  console.log("Sheet ID    :", sheet.id);
  console.log("Total rows  :", sheet.totalRowCount);
  console.log("Permalink   :", sheet.permalink ?? "(none)");

  console.log("\n=== Columns ===");
  for (const c of sheet.columns) {
    const opts =
      c.options && c.options.length > 0
        ? ` [options: ${c.options.slice(0, 8).join(", ")}${c.options.length > 8 ? "..." : ""}]`
        : "";
    const primary = c.primary ? " (primary)" : "";
    console.log(`  ${c.title}  —  ${c.type}${primary}${opts}`);
  }

  console.log(
    "\nNo row data printed. Re-run with --sample to print one redacted row.",
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Inspection failed:", err);
  process.exit(1);
});
