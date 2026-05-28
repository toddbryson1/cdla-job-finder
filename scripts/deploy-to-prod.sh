#!/usr/bin/env bash
# Phase 1 production deploy — runs migrations, imports CR England,
# seeds posting cycles, smoke-tests prod URL.
#
# Prereq: /tmp/cdla-prod.env exists with at least DATABASE_URL set
# (CRON_SECRET optional but needed for the cron smoke check).
#
# Usage:
#   scripts/deploy-to-prod.sh
#
# Idempotent — re-running is safe. Migrations skip applied ones via the
# drizzle journal; import-cre upserts via external_source_id; seed-cycles
# only spawns when a job has < TARGET_CITIES_PER_JOB active cycles.

set -euo pipefail

ENV_FILE="/tmp/cdla-prod.env"
if [ ! -f "$ENV_FILE" ]; then
  echo "✗ $ENV_FILE not found. Write DATABASE_URL there first." >&2
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

if [ -z "${DATABASE_URL:-}" ]; then
  echo "✗ DATABASE_URL not set after sourcing $ENV_FILE" >&2
  exit 1
fi

# Print just host portion for confirmation (no credentials)
HOST=$(echo "$DATABASE_URL" | python3 -c 'import sys, urllib.parse as u; p=u.urlparse(sys.stdin.read().strip()); print(p.hostname or "?")')
echo "Deploying to DB host: $HOST"
echo "═══════════════════════════════════════════════════════════════"

# Step 1: migrations
echo ""
echo "▶ Step 1/4 — Applying migrations to Neon"
echo "─────────────────────────────────────────"
npm run db:migrate 2>&1 | grep -vE "^\{|severity|^  message|^  file|^  line|^  routine|^  code|^  detail" | tail -10
echo "✓ migrations applied"

# Step 2: import CR England
echo ""
echo "▶ Step 2/4 — Importing CR England jobs from CSV"
echo "─────────────────────────────────────────"
npx tsx scripts/import-cre.ts --apply 2>&1 | tail -8
echo "✓ CR England import complete"

# Step 3: seed posting cycles
echo ""
echo "▶ Step 3/4 — Seeding posting cycles for all active jobs"
echo "─────────────────────────────────────────"
npx tsx scripts/seed-cycles.ts 2>&1 | tail -8
echo "✓ posting cycles seeded"

# Step 4: prod-DB verification + URL smoke
echo ""
echo "▶ Step 4/4 — Verify prod DB + smoke prod URL"
echo "─────────────────────────────────────────"
npx tsx scripts/_verify-prod.ts
SMOKE_BASE_URL=https://www.cdla.jobs CRON_SECRET="${CRON_SECRET:-}" \
  npx tsx scripts/smoke-test.ts 2>&1 | tail -10

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo "Deploy complete. Next:"
echo "  - Spot-check https://www.cdla.jobs/jobs/atlanta-reefer (real pay numbers)"
echo "  - Spot-check https://www.cdla.jobs/sitemap.xml (has /job/* URLs)"
echo "  - Open docs/RUNBOOK_google-for-jobs.md and start Phase 3"
echo "  - When done, delete /tmp/cdla-prod.env"
