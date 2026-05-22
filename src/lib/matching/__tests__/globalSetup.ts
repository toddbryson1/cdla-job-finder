import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { seedCarriers } from "../../../../scripts/seed";
import { importZipCodes } from "../../../../scripts/import-zip-codes";

export default async function setup() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client);

  await db.execute(sql`TRUNCATE TABLE drivers RESTART IDENTITY CASCADE`);
  await importZipCodes(db);
  await seedCarriers(db);

  await client.end();
}
