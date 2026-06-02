// Migration-drift health probe. Reads the codebase's drizzle journal
// at build time, queries Drizzle's __drizzle_migrations table at
// runtime, and reports whether the database is up to date with the
// migrations the code expects.
//
// Why this exists: anonymous-intake intermittently failed in prod for
// ~hours on 2026-06-01 because migration 0024 (DROP NOT NULL on
// drivers.first_name etc.) shipped with the code but wasn't applied
// to the prod database. The 500s only showed up when an actual driver
// tried to submit. This probe surfaces the gap PROACTIVELY — from the
// daily cron log and from a public health endpoint — so the next
// drift gets noticed within minutes instead of hours.
//
// Drizzle's journal.json is the codebase's source of truth for which
// migrations exist. The DB's drizzle.__drizzle_migrations table is
// the source of truth for which have been applied. If applied count <
// journal count, the prod DB needs `psql -f drizzle/NNNN_*.sql` runs
// for the missing files (or the equivalent CI/CD step).

import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import journalData from "../../../drizzle/meta/_journal.json";

interface JournalEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}

interface JournalShape {
  version: string;
  dialect: string;
  entries: JournalEntry[];
}

const journal: JournalShape = journalData as JournalShape;

export interface MigrationHealthResult {
  ok: boolean;
  expected: {
    count: number;
    latestTag: string;
  };
  applied: {
    count: number;
  };
  pendingTags: string[];
  /** Driver-facing-friendly summary; safe to surface in logs or admin. */
  message: string;
}

/**
 * Snapshot of what the codebase expects. Available at build time — no
 * DB call needed. Exported separately so the cron logger can include
 * the expected version without awaiting the DB query.
 */
export function getExpectedMigrationState(): MigrationHealthResult["expected"] {
  const entries = journal.entries ?? [];
  return {
    count: entries.length,
    latestTag: entries[entries.length - 1]?.tag ?? "(none)",
  };
}

export async function checkMigrationHealth(): Promise<MigrationHealthResult> {
  const expected = getExpectedMigrationState();

  // The drizzle schema lives in its own schema (named "drizzle") with
  // the bookkeeping table "__drizzle_migrations". Returning count is
  // cheap; the table has 1 row per applied migration.
  let appliedCount = 0;
  try {
    const result = await db.execute(
      sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`,
    );
    // drizzle's execute returns {rows: [...]} for postgres-js OR a
    // plain array depending on driver version. Defensive read.
    const rows =
      Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
    const first = rows[0] as { n?: number } | undefined;
    appliedCount = typeof first?.n === "number" ? first.n : 0;
  } catch (err) {
    // If the bookkeeping schema doesn't exist at all (e.g. brand new DB
    // that hasn't been migrated yet), surface that explicitly.
    return {
      ok: false,
      expected,
      applied: { count: 0 },
      pendingTags: journal.entries.map((e) => e.tag),
      message: `MIGRATION DRIFT: drizzle.__drizzle_migrations is missing or unreachable (${err instanceof Error ? err.message : String(err)}). The DB has not been migrated. Run \`npm run db:migrate\` against this database before serving traffic.`,
    };
  }

  const ok = appliedCount >= expected.count;

  // Compute which tags are "pending" — the entries past whatever index
  // matches appliedCount. Drizzle applies migrations in journal order,
  // so the unapplied set is the suffix from idx >= appliedCount.
  const pendingTags = ok
    ? []
    : journal.entries.slice(appliedCount).map((e) => e.tag);

  return {
    ok,
    expected,
    applied: { count: appliedCount },
    pendingTags,
    message: ok
      ? `Migrations up to date (${appliedCount} applied; latest expected: ${expected.latestTag}).`
      : `MIGRATION DRIFT: ${appliedCount} of ${expected.count} migrations applied. Pending: ${pendingTags.join(", ")}. Apply with \`psql $DATABASE_URL -1 -f drizzle/<tag>.sql\` for each pending file, then redeploy or wait for the next request.`,
  };
}
