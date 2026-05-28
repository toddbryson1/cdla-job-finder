// Post-deploy verification. Run after deploy-to-prod.sh against the
// same env file. Prints a summary of what landed:
//
//   carriers active                 N
//   carrier_jobs active             N (Swift + CRE + seed)
//   cycles active                   N (primary + secondary)
//   cycles with sane validThrough   N
//   OTR invariant violations        0 (CHECK constraint protects us)
//   zip_codes loaded                33,227
//
// No DB writes. Read-only verification.

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const { db } = await import("../src/db/client");
  const { sql } = await import("drizzle-orm");

  const queries: Array<{ label: string; sql: string }> = [
    {
      label: "carriers active",
      sql: "SELECT COUNT(*)::int n FROM carriers WHERE status='active'",
    },
    {
      label: "carrier_jobs active",
      sql: "SELECT COUNT(*)::int n FROM carrier_jobs WHERE status='active'",
    },
    {
      label: "  by data source",
      sql: "SELECT data_source AS k, COUNT(*)::int n FROM carrier_jobs WHERE status='active' GROUP BY 1 ORDER BY 2 DESC",
    },
    {
      label: "  by carrier",
      sql: "SELECT c.name AS k, COUNT(j.*)::int n FROM carriers c JOIN carrier_jobs j ON j.carrier_id=c.id WHERE c.status='active' AND j.status='active' GROUP BY 1 ORDER BY 2 DESC LIMIT 10",
    },
    {
      label: "active posting cycles",
      sql: "SELECT COUNT(*)::int n FROM job_posting_cycles WHERE status='active'",
    },
    {
      label: "  primary cycles",
      sql: "SELECT COUNT(*)::int n FROM job_posting_cycles WHERE status='active' AND is_primary",
    },
    {
      label: "  cycles with future validThrough",
      sql: "SELECT COUNT(*)::int n FROM job_posting_cycles WHERE status='active' AND expires_at > NOW()",
    },
    {
      label: "  overdue active cycles (BUG if > 0)",
      sql: "SELECT COUNT(*)::int n FROM job_posting_cycles WHERE status='active' AND expires_at <= NOW()",
    },
    {
      label: "OTR invariant violations (BUG if > 0)",
      sql: "SELECT COUNT(*)::int n FROM carrier_jobs WHERE status='active' AND hiring_radius_miles IS NULL AND NOT 'otr' = ANY(accepted_home_time_types)",
    },
    {
      label: "zip_codes loaded",
      sql: "SELECT COUNT(*)::int n FROM zip_codes",
    },
  ];

  console.log("");
  console.log("Production DB verification");
  console.log("───────────────────────────────────────────────");
  for (const q of queries) {
    try {
      const rows = (await db.execute(sql.raw(q.sql))) as unknown as Array<
        Record<string, unknown>
      >;
      if (rows.length === 1 && "n" in rows[0]) {
        console.log(`  ${q.label.padEnd(45)} ${rows[0].n}`);
      } else if (rows.length > 0) {
        console.log(`  ${q.label}:`);
        for (const r of rows) {
          console.log(`      ${String(r.k).padEnd(35)} ${r.n}`);
        }
      } else {
        console.log(`  ${q.label.padEnd(45)} (no rows)`);
      }
    } catch (err) {
      console.log(
        `  ${q.label.padEnd(45)} ERROR: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  console.log("");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
