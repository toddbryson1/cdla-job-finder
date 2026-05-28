// Idempotent seed for the content machine's article_topics and
// article_regions tables. Safe to re-run — uses NOT EXISTS guards so
// repeated runs don't duplicate rows and don't clobber last_used_at.
//
// Topics come from Section 2 of docs/CDLAjobs_Daily_Article_Prompt.md.
// Regions come from the metros in src/lib/slugs.ts (state-scoped only;
// multi-state regions like "the Southeast" don't fit the prompt's
// "City, ST" target format).

import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { articleRegions, articleTopics } from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

interface TopicSeed {
  bucket: 1 | 2 | 3 | 4;
  topic: string;
  regionScoped: boolean;
  requiresData: boolean;
}

// Region-scoped + requires_data flags reflect what the topic *needs* in
// its prompt — not what the article would do if scoped manually. The
// selector uses requires_data to de-prioritize when no verified figures
// are available for the day's region.
const TOPICS: TopicSeed[] = [
  // Bucket 1 — Pay & money
  { bucket: 1, topic: "Highest-paying CDL-A jobs in {CITY}", regionScoped: true, requiresData: true },
  { bucket: 1, topic: "Freight rate trends for {MONTH/QUARTER} and what they mean for drivers", regionScoped: false, requiresData: true },
  { bucket: 1, topic: "How to land the best-paying lanes and accounts", regionScoped: false, requiresData: false },
  { bucket: 1, topic: "A realistic path toward a high income driving — what it actually takes", regionScoped: false, requiresData: false },
  { bucket: 1, topic: "Is becoming an owner-operator worth it — the real math", regionScoped: false, requiresData: false },
  { bucket: 1, topic: "Which endorsements add the most to a paycheck", regionScoped: false, requiresData: false },

  // Bucket 2 — Career strategy
  { bucket: 2, topic: "How long to stay at a carrier before moving on", regionScoped: false, requiresData: false },
  { bucket: 2, topic: "The best way to start out as a brand-new CDL-A driver", regionScoped: false, requiresData: false },
  { bucket: 2, topic: "What not to do as a new driver — common early mistakes", regionScoped: false, requiresData: false },
  { bucket: 2, topic: "How to read a job offer past the headline pay number", regionScoped: false, requiresData: false },
  { bucket: 2, topic: "When to switch equipment types, and when not to", regionScoped: false, requiresData: false },
  { bucket: 2, topic: "How to build a clean record that carriers compete for", regionScoped: false, requiresData: false },

  // Bucket 3 — Life on the road / health
  { bucket: 3, topic: "How to eat well on the road without a kitchen", regionScoped: false, requiresData: false },
  { bucket: 3, topic: "Staying healthy as a driver — practical, realistic habits", regionScoped: false, requiresData: false },
  { bucket: 3, topic: "Sleep, fatigue, and getting real rest in a truck", regionScoped: false, requiresData: false },
  { bucket: 3, topic: "Truck-stop and parking strategy — finding a spot before the lot fills", regionScoped: false, requiresData: false },
  { bucket: 3, topic: "Managing home time and relationships from the road", regionScoped: false, requiresData: false },

  // Bucket 4 — How the job-search system really works ("the greed machine")
  { bucket: 4, topic: "The vanishing application — why job-board apps disappear", regionScoped: false, requiresData: false },
  { bucket: 4, topic: "The burned ad budget — why carriers spend and still can't hire", regionScoped: false, requiresData: false },
  { bucket: 4, topic: "The bonus that never existed — where sign-on money really goes", regionScoped: false, requiresData: false },
  { bucket: 4, topic: "The phone-number economy — how driver contact info gets resold", regionScoped: false, requiresData: false },
  { bucket: 4, topic: "The 'up to' pay number — why the ceiling is bait and the floor is missing", regionScoped: false, requiresData: false },
  { bucket: 4, topic: "What the alternative looks like — how a matching model changes the incentive", regionScoped: false, requiresData: false },
];

interface RegionSeed {
  city: string;
  state: string;
}

const REGIONS: RegionSeed[] = [
  { city: "Atlanta", state: "GA" },
  { city: "Dallas", state: "TX" },
  { city: "Houston", state: "TX" },
  { city: "Chicago", state: "IL" },
  { city: "Denver", state: "CO" },
  { city: "Phoenix", state: "AZ" },
  { city: "Sacramento", state: "CA" },
  { city: "Miami", state: "FL" },
];

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);

  let topicsInserted = 0;
  for (const t of TOPICS) {
    // NOT EXISTS guard — last_used_at on existing rows must not be clobbered.
    const res = await db.execute(sql`
      INSERT INTO ${articleTopics} (bucket, topic, region_scoped, requires_data)
      SELECT ${t.bucket}, ${t.topic}, ${t.regionScoped}, ${t.requiresData}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${articleTopics}
        WHERE bucket = ${t.bucket} AND topic = ${t.topic}
      )
    `);
    if (res.count === 1) topicsInserted++;
  }

  let regionsInserted = 0;
  for (const r of REGIONS) {
    const res = await db.execute(sql`
      INSERT INTO ${articleRegions} (city, state)
      SELECT ${r.city}, ${r.state}
      WHERE NOT EXISTS (
        SELECT 1 FROM ${articleRegions}
        WHERE city = ${r.city} AND state = ${r.state}
      )
    `);
    if (res.count === 1) regionsInserted++;
  }

  console.log(
    `Content machine seed complete: ${topicsInserted} new topics, ${regionsInserted} new regions (idempotent).`,
  );

  await client.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
