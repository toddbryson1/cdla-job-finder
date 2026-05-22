import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { zipCodes } from "../src/db/schema";

interface CsvRow {
  city: string;
  city_ascii: string;
  state_id: string;
  state_name: string;
  lat: string;
  lng: string;
  zips: string;
}

const ZIP_CSV_PATH = path.resolve(process.cwd(), "data", "us-zip-codes.csv");

export async function importZipCodes(
  db: ReturnType<typeof drizzle>,
  { force = false }: { force?: boolean } = {},
): Promise<{ inserted: number; skipped: boolean }> {
  if (!force) {
    const existing = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM zip_codes`,
    );
    if ((existing[0]?.n ?? 0) > 0) {
      return { inserted: existing[0]?.n ?? 0, skipped: true };
    }
  } else {
    await db.execute(sql`TRUNCATE TABLE zip_codes`);
  }

  const csv = readFileSync(ZIP_CSV_PATH, "utf8");
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  const seen = new Set<string>();
  const batch: { zip: string; city: string; state: string; lat: string; lng: string }[] = [];

  for (const r of rows) {
    if (!r.zips || !r.lat || !r.lng || !r.state_id) continue;
    const zips = r.zips.split(/\s+/).filter((z) => /^\d{5}$/.test(z));
    for (const z of zips) {
      if (seen.has(z)) continue;
      seen.add(z);
      batch.push({
        zip: z,
        city: r.city_ascii || r.city,
        state: r.state_id,
        lat: r.lat,
        lng: r.lng,
      });
    }
  }

  const CHUNK = 1000;
  let inserted = 0;
  for (let i = 0; i < batch.length; i += CHUNK) {
    const slice = batch.slice(i, i + CHUNK);
    await db.insert(zipCodes).values(slice).onConflictDoNothing();
    inserted += slice.length;
  }

  return { inserted, skipped: false };
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  const force = process.argv.includes("--force");
  console.log(`Importing zip codes${force ? " (force-refresh)" : ""}...`);
  const result = await importZipCodes(db, { force });
  if (result.skipped) {
    console.log(`zip_codes already populated (${result.inserted} rows). Use --force to re-import.`);
  } else {
    console.log(`Inserted ${result.inserted} zip codes.`);
  }

  await client.end();
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("import-zip-codes.ts") ||
    process.argv[1].endsWith("import-zip-codes.js"))
) {
  main().catch((err) => {
    console.error("Zip import failed:", err);
    process.exit(1);
  });
}
