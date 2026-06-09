// One-shot helper: prints the exact commands to apply a Drizzle
// migration to prod and (for the manual psql path) the bookkeeping
// INSERT with the correct hash already computed.
//
// Migrations here are hand-authored and applied to Neon out-of-band
// (drizzle-kit generate needs a TTY the Codespace doesn't have), so
// the `drizzle.__drizzle_migrations` row has to be backfilled by hand
// when you go the psql route. This script removes the error-prone part
// — computing sha256(<file>) exactly the way drizzle's migrator does
// (crypto.createHash("sha256").update(fileContents)).
//
// Usage:
//   npx tsx scripts/_print-migration-apply.ts            # latest migration
//   npx tsx scripts/_print-migration-apply.ts 0033_funnel_events
//   npx tsx scripts/_print-migration-apply.ts --all      # every migration
//
// Reads only local files (journal + .sql) — no DB connection, safe to
// run anywhere. Nothing here writes; you copy the printed commands.

import { createHash } from "crypto";
import { readFileSync } from "fs";
import path from "path";

const DRIZZLE_DIR = path.resolve(__dirname, "..", "drizzle");
const JOURNAL = path.join(DRIZZLE_DIR, "meta", "_journal.json");

interface JournalEntry {
  idx: number;
  when: number;
  tag: string;
}

function loadEntries(): JournalEntry[] {
  const journal = JSON.parse(readFileSync(JOURNAL, "utf8")) as {
    entries: JournalEntry[];
  };
  return [...journal.entries].sort((a, b) => a.idx - b.idx);
}

/** sha256 of the raw .sql file — identical to drizzle's migrator. */
function migrationHash(tag: string): string {
  const sql = readFileSync(path.join(DRIZZLE_DIR, `${tag}.sql`), "utf8");
  return createHash("sha256").update(sql).digest("hex");
}

function printOne(e: JournalEntry): void {
  const hash = migrationHash(e.tag);
  console.log(`# --- ${e.tag} (idx ${e.idx}, when ${e.when}) ---`);
  console.log(`psql "$PROD_DATABASE_URL" -f drizzle/${e.tag}.sql`);
  console.log(
    `psql "$PROD_DATABASE_URL" -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${e.when});"`,
  );
  console.log("");
}

function main(): void {
  const arg = process.argv[2];
  const entries = loadEntries();

  let targets: JournalEntry[];
  if (arg === "--all") {
    targets = entries;
  } else if (arg) {
    const tag = arg.replace(/\.sql$/, "");
    const found = entries.find((e) => e.tag === tag);
    if (!found) {
      console.error(
        `No journal entry for "${tag}". Known tags:\n  ${entries
          .map((e) => e.tag)
          .join("\n  ")}`,
      );
      process.exit(1);
    }
    targets = [found];
  } else {
    targets = [entries[entries.length - 1]];
  }

  const lines: string[] = [];
  const log = (s = "") => lines.push(s);

  log("");
  log("================ APPLY MIGRATION TO PROD ================");
  log("");
  log("RECOMMENDED — let the migrator do it. It applies whatever is");
  log("pending (only migrations newer than prod's latest, in order)");
  log("and records the correct hash automatically:");
  log("");
  log('  DATABASE_URL="<PROD_NEON_URL>" npm run db:migrate');
  log("");
  log("Use this if you're unsure what prod's latest applied tag is, or");
  log("if more than one migration is pending — it can't get the order");
  log("or the bookkeeping wrong.");
  log("");
  log("-------- MANUAL psql PATH (advanced) --------");
  log("");
  log("Only safe when every EARLIER migration is already applied to");
  log("prod. The migrator keys off created_at: if you insert a newer");
  log("created_at while an older migration is still pending, that older");
  log("one will be skipped forever. When in doubt, use the migrator.");
  log("");
  log("Set the target first (keep it out of your shell history):");
  log('  read -rs PROD_DATABASE_URL; export PROD_DATABASE_URL');
  log("");
  console.log(lines.join("\n"));

  for (const e of targets) printOne(e);

  console.log("-------- VERIFY --------");
  console.log("");
  console.log("curl -s https://www.cdla.jobs/api/health/db | jq '.ok, .latest'");
  console.log("");
  console.log(
    `Expect ok=true and latest="${targets[targets.length - 1].tag}".`,
  );
  console.log("");
}

main();
