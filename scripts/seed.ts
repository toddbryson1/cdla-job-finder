import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { carrierHiringRules, carriers } from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

interface SeedCarrier {
  name: string;
  kind: "partner" | "prospect";
  tier: "tier_1" | "tier_2";
  rules: Array<{
    region: string;
    equipment: string;
    payMinWeekly: number;
    payMaxWeekly: number;
    homeTime: "daily" | "weekly" | "biweekly" | "otr";
    minYearsExp?: number;
    allowsDui?: boolean;
    allowsFelony?: boolean;
    allowsFailedDotTest?: boolean;
  }>;
}

/**
 * Composite example carriers — clearly fake. Per the doc's compliance rules,
 * never present these as real partner outcomes; they exist only so the
 * landing-page resolver has something to render against during dev.
 */
const SEED: SeedCarrier[] = [
  {
    name: "Example Reefer Co (composite)",
    kind: "partner",
    tier: "tier_1",
    rules: [
      { region: "atlanta", equipment: "reefer", payMinWeekly: 1400, payMaxWeekly: 1850, homeTime: "weekly", minYearsExp: 2 },
      { region: "southeast", equipment: "reefer", payMinWeekly: 1350, payMaxWeekly: 1900, homeTime: "biweekly", minYearsExp: 2 },
      { region: "georgia", equipment: "reefer", payMinWeekly: 1400, payMaxWeekly: 1800, homeTime: "weekly", minYearsExp: 2 },
    ],
  },
  {
    name: "Example Southern Reefer (composite)",
    kind: "partner",
    tier: "tier_2",
    rules: [
      { region: "atlanta", equipment: "reefer", payMinWeekly: 1300, payMaxWeekly: 1700, homeTime: "weekly", minYearsExp: 1 },
      { region: "miami", equipment: "reefer", payMinWeekly: 1400, payMaxWeekly: 1800, homeTime: "weekly" },
    ],
  },
  {
    name: "Example Flatbed Group (composite)",
    kind: "partner",
    tier: "tier_1",
    rules: [
      { region: "dallas", equipment: "flatbed", payMinWeekly: 1500, payMaxWeekly: 2100, homeTime: "weekly", minYearsExp: 3 },
      { region: "texas", equipment: "flatbed", payMinWeekly: 1500, payMaxWeekly: 2100, homeTime: "weekly", minYearsExp: 3 },
      { region: "houston", equipment: "flatbed", payMinWeekly: 1450, payMaxWeekly: 2000, homeTime: "biweekly" },
    ],
  },
  {
    name: "Example Tanker Partners (composite)",
    kind: "partner",
    tier: "tier_2",
    rules: [
      { region: "houston", equipment: "tanker", payMinWeekly: 1600, payMaxWeekly: 2200, homeTime: "weekly", minYearsExp: 3 },
      { region: "gulf-coast", equipment: "tanker", payMinWeekly: 1550, payMaxWeekly: 2100, homeTime: "biweekly" },
    ],
  },
  {
    name: "Example Dry Van Carrier (composite)",
    kind: "partner",
    tier: "tier_2",
    rules: [
      { region: "chicago", equipment: "dry-van", payMinWeekly: 1300, payMaxWeekly: 1700, homeTime: "weekly" },
      { region: "midwest", equipment: "dry-van", payMinWeekly: 1250, payMaxWeekly: 1700, homeTime: "biweekly" },
    ],
  },
  {
    name: "Example OTR Fleet (composite)",
    kind: "partner",
    tier: "tier_1",
    rules: [
      { region: "southeast", equipment: "otr", payMinWeekly: 1500, payMaxWeekly: 2000, homeTime: "otr", minYearsExp: 2 },
      { region: "i95-corridor", equipment: "reefer", payMinWeekly: 1550, payMaxWeekly: 2050, homeTime: "biweekly" },
    ],
  },
  {
    name: "Prospect Carrier A",
    kind: "prospect",
    tier: "tier_2",
    rules: [
      { region: "atlanta", equipment: "reefer", payMinWeekly: 1300, payMaxWeekly: 1700, homeTime: "weekly" },
      { region: "dallas", equipment: "flatbed", payMinWeekly: 1400, payMaxWeekly: 1900, homeTime: "weekly" },
    ],
  },
  {
    name: "Prospect Carrier B",
    kind: "prospect",
    tier: "tier_2",
    rules: [
      { region: "houston", equipment: "tanker", payMinWeekly: 1500, payMaxWeekly: 2000, homeTime: "biweekly" },
      { region: "denver", equipment: "regional", payMinWeekly: 1200, payMaxWeekly: 1600, homeTime: "weekly" },
      { region: "california", equipment: "tanker", payMinWeekly: 1700, payMaxWeekly: 2300, homeTime: "weekly" },
    ],
  },
];

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);

  console.log("Clearing carrier-related tables...");
  await db.execute(sql`TRUNCATE TABLE carrier_hiring_rules, carriers RESTART IDENTITY CASCADE`);

  console.log(`Inserting ${SEED.length} carriers...`);
  for (const c of SEED) {
    const [carrier] = await db
      .insert(carriers)
      .values({ name: c.name, kind: c.kind, tier: c.tier })
      .returning({ id: carriers.id });
    if (!carrier) continue;

    if (c.rules.length > 0) {
      await db.insert(carrierHiringRules).values(
        c.rules.map((r) => ({
          carrierId: carrier.id,
          region: r.region,
          equipment: r.equipment,
          payMinWeekly: r.payMinWeekly,
          payMaxWeekly: r.payMaxWeekly,
          homeTime: r.homeTime,
          minYearsExp: r.minYearsExp ?? 0,
          allowsDui: r.allowsDui ?? false,
          allowsFelony: r.allowsFelony ?? false,
          allowsFailedDotTest: r.allowsFailedDotTest ?? false,
        })),
      );
    }
  }

  const counts = await db.execute<{ table: string; n: number }>(
    sql`select 'carriers' as table, count(*)::int as n from carriers
        union all select 'carrier_hiring_rules', count(*)::int from carrier_hiring_rules`,
  );
  console.log("Seed complete:");
  for (const r of counts) console.log(`  ${r.table}: ${r.n}`);

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
