// Tiny one-off: connect to prod DATABASE_URL (loaded from
// .env.production) and print counts so we can see whether the seed
// landed where we expected.

import { config } from "dotenv";
config({ path: ".env.production", override: true });

import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set in .env.production");
  process.exit(1);
}

console.log("URL host:", new URL(url).host);

const sql = postgres(url, { max: 1 });

async function main() {
  console.log("\n=== Topic counts by bucket ===");
  const byBucket = await sql<
    Array<{ bucket: number; total: number; active: number }>
  >`SELECT bucket, count(*)::int AS total,
           sum(CASE WHEN active THEN 1 ELSE 0 END)::int AS active
    FROM article_topics GROUP BY bucket ORDER BY bucket`;
  for (const r of byBucket)
    console.log(`  bucket ${r.bucket}: ${r.total} total, ${r.active} active`);

  console.log("\n=== Most recent content_machine_runs ===");
  const runs = await sql<
    Array<{
      run_date: string;
      status: string;
      requested_count: number;
      published_count: number;
      failed_count: number;
      error_message: string | null;
    }>
  >`SELECT run_date::text, status, requested_count, published_count,
           failed_count, error_message
    FROM content_machine_runs ORDER BY started_at DESC LIMIT 5`;
  for (const r of runs) {
    console.log(
      `  ${r.run_date} ${r.status.padEnd(10)} req=${r.requested_count} pub=${r.published_count} fail=${r.failed_count}${r.error_message ? ` err="${r.error_message.slice(0, 80)}"` : ""}`,
    );
  }

  console.log("\n=== content_machine_state ===");
  const state = await sql<
    Array<{
      id: number;
      last_bucket_cursor: number;
      last_run_date: string | null;
    }>
  >`SELECT id, last_bucket_cursor, last_run_date::text FROM content_machine_state`;
  for (const r of state)
    console.log(
      `  id=${r.id} cursor=${r.last_bucket_cursor} last_run=${r.last_run_date}`,
    );

  // Simulate the planDailyRun logic against prod to see what pickTopic
  // returns for the next bucket. cursor is currently 3, so count=1
  // would pick bucket (3%4)+1 = 4.
  const nextBucket =
    ((state[0]?.last_bucket_cursor ?? 0) % 4) + 1;
  console.log(`\n=== Simulating pickTopic for bucket ${nextBucket} ===`);
  const picked = await sql<
    Array<{
      id: string;
      topic: string;
      region_scoped: boolean;
      requires_data: boolean;
      last_used_at: string | null;
      active: boolean;
    }>
  >`SELECT id::text, topic, region_scoped, requires_data,
           last_used_at::text, active
    FROM article_topics
    WHERE bucket = ${nextBucket} AND active = true
    ORDER BY requires_data ASC, last_used_at ASC NULLS FIRST, id
    LIMIT 5`;
  if (picked.length === 0) {
    console.log("  NO ROWS — this is why requested_count=0");
  } else {
    for (const r of picked) {
      console.log(
        `  ${r.topic.slice(0, 60)} (active=${r.active}, last_used=${r.last_used_at ?? "never"})`,
      );
    }
  }

  console.log("\n=== articleRegions sample ===");
  const regs = await sql<
    Array<{ city: string; state: string; active: boolean }>
  >`SELECT city, state, active FROM article_regions LIMIT 3`;
  for (const r of regs)
    console.log(`  ${r.city}, ${r.state} (active=${r.active})`);

  // The Vercel cron logged: syncSwift mapped:89 updated:89.
  // If this DB has ~89 active Swift carrier_jobs, it's the same DB
  // the cron uses. If not, they're connected to different DBs.
  console.log("\n=== carrier_jobs count by source (cron-DB identity check) ===");
  const jobs = await sql<
    Array<{ data_source: string; total: number; active: number }>
  >`SELECT data_source::text,
           count(*)::int AS total,
           sum(CASE WHEN status = 'active' THEN 1 ELSE 0 END)::int AS active
    FROM carrier_jobs GROUP BY data_source`;
  for (const r of jobs)
    console.log(`  ${r.data_source.padEnd(40)} total=${r.total} active=${r.active}`);

  await sql.end();
}

main().catch((err) => {
  console.error(err);
  sql.end();
  process.exit(1);
});
