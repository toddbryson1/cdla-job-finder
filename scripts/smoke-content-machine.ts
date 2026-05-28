// One-off smoke test for the content machine. Generates exactly one
// article against the local Postgres DB, calling the real Anthropic
// API. Skips the daily email so RESEND_API_KEY isn't required.
//
// Safety guards:
//   - Verifies DATABASE_URL points at localhost — refuses to run if
//     it appears to point at prod (the .env.production file would
//     poison the run if loaded by accident)
//   - Loads only ANTHROPIC_API_KEY from .env.production; everything
//     else comes from .env.local
//   - Sets CONTENT_MACHINE_ENABLED=true and COUNT=1 at runtime so the
//     real env doesn't have to be edited just for the smoke test
//
// Usage:  npm run smoke:content

import { config } from "dotenv";
import { readFileSync } from "node:fs";

// Precedence for ANTHROPIC_API_KEY:
//   1. .env.local (developer-supplied, intentional)
//   2. .env.production (fallback)
//   3. shell env (ignored — Claude Code sessions set a key that only
//      works against their proxy, not api.anthropic.com)
//
// We never pull DATABASE_URL from .env.production — writing a smoke
// article to the prod DB would be bad.

// Drop any shell-set ANTHROPIC vars before loading dotenv files so
// dotenv's "don't overwrite existing env" behavior doesn't preserve
// the wrong key.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_BASE_URL;

config({ path: ".env.local" });

if (!process.env.ANTHROPIC_API_KEY) {
  try {
    const prod = readFileSync(".env.production", "utf8");
    const m = prod.match(/^ANTHROPIC_API_KEY=(.+)$/m);
    if (m) {
      process.env.ANTHROPIC_API_KEY = m[1].trim();
    }
  } catch {
    // .env.production may not exist — fall through to the check below.
  }
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.error(
    "ANTHROPIC_API_KEY not set. Add it to .env.local or .env.production.",
  );
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL ?? "";
if (!dbUrl.includes("localhost") && !dbUrl.includes("127.0.0.1")) {
  console.error(
    `Refusing to run: DATABASE_URL doesn't look local (${dbUrl.replace(/:[^/]+@/, ":***@")}).`,
  );
  process.exit(1);
}

process.env.CONTENT_MACHINE_ENABLED = "true";
process.env.CONTENT_MACHINE_DAILY_COUNT = "1";

async function main() {
  // Dynamic import so the run.ts module sees the env we just set.
  const { runContentMachine } = await import(
    "../src/lib/content-machine/run"
  );

  console.log("Starting smoke run (count=1, skipEmail=true)...");
  const start = Date.now();
  const result = await runContentMachine({ skipEmail: true });
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`\nFinished in ${elapsed}s. Result:\n`);
  console.log(JSON.stringify(result, null, 2));

  if (result.status === "DISABLED") {
    console.log("\n(Machine reported DISABLED — env not picked up?)");
    process.exit(1);
  }

  // Show what was written
  const { db } = await import("../src/db/client");
  const { articles, contentMachineRuns } = await import("../src/db/schema");
  const { desc } = await import("drizzle-orm");

  const latestRun = await db
    .select()
    .from(contentMachineRuns)
    .orderBy(desc(contentMachineRuns.startedAt))
    .limit(1);
  console.log("\n=== Latest content_machine_runs row ===");
  console.log(JSON.stringify(latestRun[0], null, 2));

  const latestArticles = await db
    .select({
      id: articles.id,
      bucket: articles.bucket,
      topic: articles.topic,
      slug: articles.slug,
      status: articles.status,
      publishedUrl: articles.publishedUrl,
      wordCount: articles.wordCount,
      failureReason: articles.failureReason,
    })
    .from(articles)
    .orderBy(desc(articles.generatedAt))
    .limit(3);
  console.log("\n=== Most recent 3 articles ===");
  console.log(JSON.stringify(latestArticles, null, 2));

  process.exit(result.status === "FAILED" ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke run threw:", err);
  process.exit(1);
});
