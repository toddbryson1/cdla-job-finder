import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

// Import after env is loaded so db/client picks up DATABASE_URL.
async function main() {
  const { db } = await import("../src/db/client");
  const { spawnPostingCycles } = await import("../src/lib/posting-cycles");
  const r = await spawnPostingCycles(db);
  console.log("spawn result:", JSON.stringify(r, null, 2));
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
