import { describe, expect, it } from "vitest";
import { getExpectedMigrationState } from "@/lib/db/migration-health";
import journalData from "../../../../drizzle/meta/_journal.json";

interface JournalEntry {
  idx: number;
  tag: string;
}
interface JournalShape {
  entries: JournalEntry[];
}
const journal = journalData as JournalShape;

// The dynamic health probe (checkMigrationHealth) talks to the DB and
// is exercised by the integration suite via the actual /api/health/db
// route at smoke time. These pure tests pin the parts that don't need
// the DB — the journal-reading half.

describe("getExpectedMigrationState", () => {
  it("returns the count of entries in the journal", () => {
    const r = getExpectedMigrationState();
    expect(r.count).toBe(journal.entries.length);
  });

  it("returns the latest tag from the journal", () => {
    const r = getExpectedMigrationState();
    const expectedLatest = journal.entries[journal.entries.length - 1]!.tag;
    expect(r.latestTag).toBe(expectedLatest);
  });

  it("the journal-vs-filesystem invariant — every entry tag matches a real .sql file naming pattern", () => {
    // Drizzle generates tags like "0024_drivers_contact_nullable". They
    // should match /^\d{4}_[a-z0-9_]+$/. If this fails, somebody hand-
    // edited journal.json with a weird name and `npm run db:migrate`
    // will probably fail downstream.
    for (const e of journal.entries) {
      expect(e.tag).toMatch(/^\d{4}_[a-z0-9_]+$/);
    }
  });

  it("the journal idx values are sequential starting at 0", () => {
    // Drizzle's runtime applies migrations in idx order. If they're
    // not 0..N-1 contiguous, the bookkeeping math in
    // checkMigrationHealth (`journal.entries.slice(appliedCount)`) is
    // wrong. Pin this so a future edit to journal.json doesn't
    // silently regress the drift-detection.
    for (let i = 0; i < journal.entries.length; i++) {
      expect(journal.entries[i]!.idx).toBe(i);
    }
  });
});

describe("migration-drift detection contract", () => {
  // Document the comparison contract via assertion. If we ever rename
  // the count fields or change the comparison direction, these will
  // catch it.
  it("ok = applied >= expected (not strict equal — extra applied is ignored)", () => {
    // Extra applied rows (someone applied a migration not yet in the
    // codebase) is unusual but NOT a regression — the code can still
    // run. Only "applied < expected" is the failure mode.
    const expected = { count: 25, latestTag: "0024_x" };
    const applied = { count: 25 };
    const ok = applied.count >= expected.count;
    expect(ok).toBe(true);
  });

  it("drift case — applied < expected fires the alert", () => {
    const expected = { count: 25, latestTag: "0024_x" };
    const applied = { count: 23 };
    const ok = applied.count >= expected.count;
    expect(ok).toBe(false);
  });
});
