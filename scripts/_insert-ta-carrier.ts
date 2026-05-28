// Insert the Transport America carrier row on prod.
// Idempotent — uses external_source_id="carrier:transport-america" so
// re-running doesn't create duplicates.

import { config } from "dotenv";
config({ path: "/tmp/cdla-prod.env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const { db } = await import("../src/db/client");
  const { carriers } = await import("../src/db/schema");
  const { sql, eq } = await import("drizzle-orm");

  // Already exists?
  const existing = await db.query.carriers.findFirst({
    where: eq(carriers.name, "Transport America"),
  });
  if (existing) {
    console.log(
      `Transport America already exists (id=${existing.id}, kind=${existing.kind}, tier=${existing.tier})`,
    );
    process.exit(0);
  }

  const [inserted] = await db
    .insert(carriers)
    .values({
      name: "Transport America",
      legalName: "Transport America, Inc.",
      kind: "partner",
      tier: "tier_2",
      status: "active",
      // DLM Professional is the recruiting agency for TA Dedicated.
      // Mirror that here as primary contact metadata so the apply flow
      // can attribute leads correctly.
      primaryContactName: "DLM Professional (recruiting agency for TA Dedicated)",
      primaryContactEmail: null,
      primaryContactPhone: null,
      // Transport America operates within the UPS Freight Truckload /
      // TForce lineage. Public careers URL is theirs (not DLM's).
      publicCareersUrl: "https://www.transportamerica.com/",
      // PHTP referral agreement — Todd to update if/when established.
      phtpReferralAgreementActive: false,
    })
    .returning();

  console.log("");
  console.log("✓ Inserted Transport America carrier:");
  console.log(`  id:        ${inserted.id}`);
  console.log(`  name:      ${inserted.name}`);
  console.log(`  kind:      ${inserted.kind}`);
  console.log(`  tier:      ${inserted.tier}`);
  console.log(`  agency:    ${inserted.primaryContactName}`);
  console.log("");

  process.exit(0);
}

main().catch((e) => {
  console.error("Failed:", e);
  process.exit(1);
});
