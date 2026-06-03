// One-shot prod smoke test. Runs the verifications I've been doing
// manually after each Vercel deploy + bundles them into a single
// "did this push actually land + work" command.
//
// What it checks (all read-only, all anonymous — no auth needed,
// no PII collected):
//
//   1. /api/health/db returns ok=true with applied >= expected
//      AND the latest tag matches what the local journal says.
//      Catches: migration drift, build/deploy failures.
//
//   2. Homepage returns 200 + the live Debbie chat shell renders
//      (i.e. the homepage isn't the 13-hour-stale snapshot we hit
//      on 2026-06-02 from the Hobby-tier cron rejection).
//      Catches: Vercel build queue stuck, cron-config rejections.
//
//   3. Debbie Q1 round-trip — POST /api/debbie/intake with a
//      synthetic "30303" → expect state transition to Q2_experience
//      with homeZip extracted.
//      Catches: ANTHROPIC_API_KEY missing/wrong/leaked, tool_use
//      contract regression, route 5xx.
//
//   4. Sitemap fetch + URL count — confirms the route is reachable
//      and serves >= 50 /job/* URLs (well below current ~700 but
//      catches a fully empty sitemap regression).
//
//   5. Cron auth gates — /api/cron/{daily,qb-retry} both 401 with
//      no auth, confirming we haven't accidentally exposed them.
//
// Exit code is 0 on all green, 1 if anything failed. Each failure
// prints a single line so output is grep-able. Designed to be
// runnable from a CI/CD step too, not just a human terminal.
//
// Usage:
//   npx tsx scripts/smoke-prod.ts
//   npx tsx scripts/smoke-prod.ts --origin https://staging.cdla.jobs

import journalData from "../drizzle/meta/_journal.json";

interface Journal {
  entries: Array<{ idx: number; tag: string }>;
}
const journal = journalData as Journal;

const DEFAULT_ORIGIN = "https://www.cdla.jobs";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const results: CheckResult[] = [];

function check(name: string, ok: boolean, detail: string): void {
  results.push({ name, ok, detail });
  const status = ok ? "✓" : "✗";
  process.stdout.write(`  ${status} ${name.padEnd(36)} ${detail}\n`);
}

async function fetchWithBust(url: string, init?: RequestInit): Promise<Response> {
  const u = new URL(url);
  u.searchParams.set("nc", String(Date.now()));
  return fetch(u.toString(), init);
}

async function main() {
  const origin =
    process.argv.includes("--origin")
      ? process.argv[process.argv.indexOf("--origin") + 1]!
      : DEFAULT_ORIGIN;

  console.log(`\nSmoke-testing ${origin}\n`);

  // 1. Migration health
  try {
    const res = await fetchWithBust(`${origin}/api/health/db`);
    const body = (await res.json()) as {
      ok?: boolean;
      applied?: { count?: number };
      expected?: { count?: number; latestTag?: string };
    };
    const localLatest = journal.entries[journal.entries.length - 1]!.tag;
    const remoteLatest = body.expected?.latestTag ?? "(unknown)";
    const applied = body.applied?.count ?? 0;
    const expected = body.expected?.count ?? 0;
    const matchesLocal = remoteLatest === localLatest;
    const hasMigrations = applied >= expected && expected > 0;
    check(
      "migration health",
      Boolean(body.ok) && hasMigrations && matchesLocal,
      `applied=${applied}/${expected} latest=${remoteLatest}${matchesLocal ? "" : ` (local: ${localLatest})`}`,
    );
  } catch (err) {
    check("migration health", false, `fetch failed: ${(err as Error).message}`);
  }

  // 2. Homepage
  try {
    const res = await fetchWithBust(`${origin}/`);
    const html = await res.text();
    const looksLikeDebbie = html.includes("Debbie") && html.includes("five minutes");
    check(
      "homepage live + Debbie shell present",
      res.status === 200 && looksLikeDebbie,
      `HTTP ${res.status}, ${html.length}B, debbie-shell=${looksLikeDebbie}`,
    );
  } catch (err) {
    check("homepage", false, `fetch failed: ${(err as Error).message}`);
  }

  // 3. Debbie Q1 round-trip
  try {
    const res = await fetch(`${origin}/api/debbie/intake`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        state: "Q1_zip",
        conversation: [
          { role: "assistant", content: "What is your home zip?" },
          { role: "user", content: "30303" },
        ],
        fields: {
          homeZip: null,
          experienceYears: null,
          schedule: null,
          terminatedLastJob: null,
          terminationReason: null,
          sapStatus: null,
        },
      }),
    });
    const body = (await res.json()) as {
      nextState?: string;
      fields?: { homeZip?: string };
    };
    const extractedZip = body.fields?.homeZip === "30303";
    const advanced = body.nextState === "Q2_experience";
    check(
      "Debbie Q1 LLM round-trip",
      res.status === 200 && extractedZip && advanced,
      `HTTP ${res.status}, zip=${body.fields?.homeZip} state=${body.nextState}`,
    );
  } catch (err) {
    check("Debbie Q1 LLM round-trip", false, `fetch failed: ${(err as Error).message}`);
  }

  // 4. Sitemap
  try {
    const res = await fetchWithBust(`${origin}/sitemap.xml`);
    const xml = await res.text();
    const jobUrlCount = [...xml.matchAll(/https:\/\/www\.cdla\.jobs\/job\/[^<]+/g)].length;
    check(
      "sitemap.xml has /job URLs",
      res.status === 200 && jobUrlCount >= 50,
      `HTTP ${res.status}, ${jobUrlCount} /job URLs`,
    );
  } catch (err) {
    check("sitemap.xml", false, `fetch failed: ${(err as Error).message}`);
  }

  // 5. Cron auth gates
  for (const path of ["/api/cron/daily", "/api/cron/qb-retry"]) {
    try {
      const res = await fetchWithBust(`${origin}${path}`);
      check(`${path} requires auth`, res.status === 401, `HTTP ${res.status}`);
    } catch (err) {
      check(`${path} requires auth`, false, `fetch failed: ${(err as Error).message}`);
    }
  }

  // 6. /api/match shape check — POST with a known-invalid driverId
  // and confirm the route returns a clean 404 rather than 5xx'ing
  // somewhere in the matching pipeline. Catches regressions in the
  // route's auth / validation / enrichment plumbing without needing
  // a real driver row.
  try {
    const res = await fetch(`${origin}/api/match`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        driverId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    // Route returns 404 when the driverId doesn't resolve to a real
    // row — exactly the path a smoke test should exercise.
    check(
      "/api/match returns 404 for unknown driver",
      res.status === 404,
      `HTTP ${res.status}`,
    );
  } catch (err) {
    check(
      "/api/match returns 404 for unknown driver",
      false,
      `fetch failed: ${(err as Error).message}`,
    );
  }

  // Summary
  const failed = results.filter((r) => !r.ok);
  console.log("");
  if (failed.length === 0) {
    console.log(`✓ All ${results.length} checks passed.`);
    process.exit(0);
  } else {
    console.log(`✗ ${failed.length} of ${results.length} checks failed:`);
    for (const f of failed) {
      console.log(`    - ${f.name}: ${f.detail}`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Smoke runner crashed:", err);
  process.exit(2);
});
