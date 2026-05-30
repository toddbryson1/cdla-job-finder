// Set an operator-supplied apply URL (typically a Tenstreet
// IntelliApp link) on a pending carrier. The override:
//
//   1. Is stored on pending_carriers.apply_url_override so it
//      survives any future crawler re-discovery
//   2. Is applied immediately to every currently-staged
//      pending_carrier_jobs row (apply_url + application_surface
//      re-classified from the URL)
//   3. Is propagated to the live carrier_jobs row at promote time
//      (or back-filled here if the carrier has already been promoted)
//
// Usage:
//   # One carrier at a time:
//   npx tsx scripts/set-intelliapp.ts --name "Pam Transport" --url "https://intelliapp..."
//
//   # Batch from JSON:
//   npx tsx scripts/set-intelliapp.ts --list overrides.json
//
//   # JSON format:
//   [
//     { "name": "Pam Transport", "intelliapp_url": "https://..." },
//     { "name": "Swift Transportation", "intelliapp_url": "https://..." }
//   ]

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";

interface Args {
  name?: string;
  url?: string;
  list?: string;
}

function parseArgs(argv: string[]): Args | null {
  const out: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--name") out.name = argv[++i];
    else if (a === "--url") out.url = argv[++i];
    else if (a === "--list") out.list = argv[++i];
    else if (a === "--help" || a === "-h") return null;
  }
  if (out.list) return out;
  if (!out.name || !out.url) return null;
  return out;
}

function printHelp() {
  console.log(`Usage:
  npx tsx scripts/set-intelliapp.ts --name <carrier> --url <intelliapp-url>
  npx tsx scripts/set-intelliapp.ts --list path/to/overrides.json

JSON list format:
  [
    { "name": "Pam Transport", "intelliapp_url": "https://..." },
    { "name": "Swift Transportation", "intelliapp_url": "https://..." }
  ]
`);
}

interface Override {
  name: string;
  intelliapp_url: string;
}

async function applyOverride(
  database: typeof import("../src/db/client").db,
  schema: typeof import("../src/db/schema"),
  carrierDiscovery: typeof import("../src/lib/carrier-discovery/classify-surface"),
  drizzle: typeof import("drizzle-orm"),
  override: Override,
): Promise<{
  ok: boolean;
  message: string;
  jobsUpdated: number;
  carrierJobsUpdated: number;
}> {
  const { sql, eq } = drizzle;
  const { pendingCarriers, pendingCarrierJobs, carrierJobs } = schema;
  const { classifyApplicationSurface } = carrierDiscovery;

  // Locate the pending carrier (case-insensitive).
  const [pending] = await database
    .select()
    .from(pendingCarriers)
    .where(sql`LOWER(${pendingCarriers.name}) = LOWER(${override.name})`)
    .limit(1);
  if (!pending) {
    return {
      ok: false,
      message: `no pending_carrier row for "${override.name}" — run discover-carrier or batch-discover first`,
      jobsUpdated: 0,
      carrierJobsUpdated: 0,
    };
  }

  // Classify the URL once so we can use the same surface across all
  // staged + live rows. Pull every host we've seen for this carrier
  // so a self-hosted URL still maps to custom_intake_form.
  const hosts = collectHosts([
    override.intelliapp_url,
    pending.homepageUrl,
    pending.careersUrl ?? undefined,
  ]);
  const { surface } = classifyApplicationSurface({
    applyUrl: override.intelliapp_url,
    carrierHosts: hosts,
  });

  // 1. Persist the override on the pending_carriers row.
  await database
    .update(pendingCarriers)
    .set({ applyUrlOverride: override.intelliapp_url })
    .where(eq(pendingCarriers.id, pending.id));

  // 2. Back-fill every currently-staged job for this pending carrier.
  const staged = await database
    .update(pendingCarrierJobs)
    .set({
      applyUrl: override.intelliapp_url,
      applicationSurface: surface,
    })
    .where(eq(pendingCarrierJobs.pendingCarrierId, pending.id))
    .returning({ id: pendingCarrierJobs.id });

  // 3. If the carrier has already been promoted, back-fill the live
  //    carrier_jobs rows too — otherwise the override never reaches
  //    drivers.
  let carrierJobsUpdated = 0;
  if (pending.promotedCarrierId) {
    const updated = await database
      .update(carrierJobs)
      .set({
        applicationUrl: override.intelliapp_url,
        applicationSurface: surface as
          | "tenstreet_intelliapp"
          | "custom_intake_form"
          | "email_only"
          | "phone_only"
          | "unknown",
      })
      .where(eq(carrierJobs.carrierId, pending.promotedCarrierId))
      .returning({ id: carrierJobs.id });
    carrierJobsUpdated = updated.length;
  }

  return {
    ok: true,
    message: `surface=${surface}, ${staged.length} staged, ${carrierJobsUpdated} live`,
    jobsUpdated: staged.length,
    carrierJobsUpdated,
  };
}

function collectHosts(urls: Array<string | undefined>): string[] {
  const out = new Set<string>();
  for (const u of urls) {
    if (!u) continue;
    try {
      out.add(new URL(u).host);
    } catch {
      /* ignore */
    }
  }
  return Array.from(out);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    printHelp();
    process.exit(args === null ? 1 : 0);
  }

  let overrides: Override[];
  if (args.list) {
    overrides = JSON.parse(readFileSync(args.list, "utf-8")) as Override[];
  } else {
    overrides = [{ name: args.name!, intelliapp_url: args.url! }];
  }

  const { db } = await import("../src/db/client");
  const schema = await import("../src/db/schema");
  const classifier = await import(
    "../src/lib/carrier-discovery/classify-surface"
  );
  const drizzle = await import("drizzle-orm");

  console.log(`Applying ${overrides.length} override(s)…\n`);
  let totalStaged = 0;
  let totalLive = 0;
  let failures = 0;
  for (const o of overrides) {
    const r = await applyOverride(db, schema, classifier, drizzle, o);
    const marker = r.ok ? "✓" : "✗";
    console.log(`  ${marker} ${o.name}: ${r.message}`);
    totalStaged += r.jobsUpdated;
    totalLive += r.carrierJobsUpdated;
    if (!r.ok) failures++;
  }
  console.log(
    `\nDone. ${totalStaged} staged + ${totalLive} live job rows updated; ${failures} carrier(s) not found.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[set-intelliapp] failed:", err);
    process.exit(1);
  });
