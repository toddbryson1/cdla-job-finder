# CDLA.jobs Content Machine — Step 1

Daily SEO article generator. Picks 1–4 (bucket, topic, region) triples
per day, generates each article by calling the Anthropic API with the
canonical prompt at [`docs/CDLAjobs_Daily_Article_Prompt.md`](../../../docs/CDLAjobs_Daily_Article_Prompt.md),
publishes to `/articles/[slug]`, updates the sitemap (automatic via
the dynamic `sitemap.ts`), pings IndexNow (Bing/Yandex/etc.), records
each article to Postgres, and emails the owner a daily report. The
master cron at `/api/cron/daily` runs this as its 5th step. Auto-
publish, no human review gate — owner reviews via the daily email.

This README covers Step 1 only. Steps 2–5 (SEO market-data pages,
video scripts, performance tracking) are out of scope.

## Required env vars

```bash
# Master switch — defaults to disabled. Must be the literal string "true".
CONTENT_MACHINE_ENABLED=true

# Articles per day (1–4 supported now; ramps higher per the plan in
# the build spec). Out-of-range values clamp to 1 and log a warning.
CONTENT_MACHINE_DAILY_COUNT=1

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6           # default if unset

# IndexNow (Bing/Yandex/etc.)
INDEXNOW_KEY=<32-hex-char key>              # `npm run gen:indexnow-key`

# Resend (daily email)
RESEND_API_KEY=re_...
CONTENT_MACHINE_REPORT_EMAIL=jabridgeco@gmail.com   # recipient
CONTENT_MACHINE_REPORT_FROM=CDLA.jobs <noreply@cdla.jobs>
# For local testing before cdla.jobs is verified in Resend, set:
# CONTENT_MACHINE_REPORT_FROM=onboarding@resend.dev

# Google Search Console — dormant. Set true ONLY when the cdla.jobs
# property is verified in GSC and a service account has been added
# as an Owner. See "Enabling GSC" below.
GSC_INTEGRATION_ENABLED=false
```

The cron handler also needs the existing `CRON_SECRET` and
`DATABASE_URL` env vars — see `.env.example`.

## How to run it locally

```bash
# One-time setup
npm install
npm run db:migrate
npm run db:seed:content        # idempotent — adds topics + regions
npm run gen:indexnow-key       # prints INDEXNOW_KEY=... — paste into .env.local

# Trigger a run against your local DB (one-off, manual)
# Either: hit the cron endpoint directly
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/daily

# Or: programmatically in a tsx script
#   import { runContentMachine } from "@/lib/content-machine/run";
#   await runContentMachine();
```

`CONTENT_MACHINE_ENABLED=true` must be set — the machine is off by
default so a stray deploy can't auto-publish articles.

## Operational levers

### Kill switch
Flip `CONTENT_MACHINE_ENABLED` between `true` and `false`. Vercel:
Project Settings → Environment Variables → edit → Save → redeploy
(or use Vercel's hot env-var update for production). When `false`,
the cron logs the disabled state, writes a `disabled` row to
`content_machine_runs`, and exits without sending any email.

### Daily count
Edit `CONTENT_MACHINE_DAILY_COUNT` in env. No redeploy of code
required for Vercel env-var changes; the next scheduled cron picks
up the new value. Supported values: `1`, `2`, `3`, `4`. Anything else
falls back to `1` with a warning log.

The bucket-skip sequencer guarantees every bucket gets coverage
across the week even at low counts:
- count=1 → one bucket per day, 4-day cycle
- count=2 → `[B1,B3]` and `[B2,B4]` alternate
- count=3 → rotate which bucket is skipped, 4-day cycle
- count=4 → all four every day

### Topics and regions
Direct DB updates are fine for v1. Both tables have `active boolean`
and `last_used_at timestamp` fields the selector keys off.

```sql
-- Add a topic
INSERT INTO article_topics (bucket, topic, region_scoped, requires_data)
VALUES (1, 'New topic title', false, false);

-- Deactivate a topic
UPDATE article_topics SET active = false WHERE id = '...';

-- Reset rotation (let the topic be picked again next time)
UPDATE article_topics SET last_used_at = NULL WHERE id = '...';

-- Add a region
INSERT INTO article_regions (city, state) VALUES ('Memphis', 'TN');

-- Deactivate a region
UPDATE article_regions SET active = false WHERE id = '...';
```

The `db:seed:content` script is idempotent — re-running it adds new
seed values from `scripts/seed-content-machine.ts` without
clobbering `last_used_at` on existing rows.

### Blocked competitor names
Maintain in [`blocked-terms.ts`](./blocked-terms.ts). Case-insensitive
whole-word match; any article whose body contains a blocked term is
marked `failed`. Default list is empty.

## Enabling GSC URL Inspection

The GSC integration is dormant by default. Two things must be done to
turn it on:

1. **Verify the cdla.jobs property** in Google Search Console
   (Settings → Ownership verification — DNS TXT or HTML file).
2. **Provision a service account** with `webmasters.readonly` scope
   and add its `client_email` as an **Owner** of the cdla.jobs
   property in Search Console.
3. **Implement** `callUrlInspectionApi()` in [`gsc.ts`](./gsc.ts) —
   the function is currently a TODO stub. The auth pattern is documented
   inline and mirrors [`../google-indexing.ts`](../google-indexing.ts);
   the only differences are the endpoint
   (`searchconsole.googleapis.com/v1/urlInspection/index:inspect`)
   and the OAuth scope.
4. Set `GSC_INTEGRATION_ENABLED=true`.

Once enabled, the daily cron processes due rows in
`article_index_status` (queued automatically at 1, 3, and 7 days
after each publish) and the daily email shows counts of articles
still unindexed at 3+ and 7+ days. Rate limit is ~2,000 requests/day
per property — comfortable for current scale.

## Reference docs (authoritative)

Do not edit the machine's behavior without consulting these:

- [`docs/CDLAjobs_Content_Plan.docx`](../../../docs/CDLAjobs_Content_Plan.docx) — overall strategy + non-negotiable rules
- [`docs/CDLAjobs_Daily_Article_Prompt.md`](../../../docs/CDLAjobs_Daily_Article_Prompt.md) — the article-generation prompt loaded as the system message
- [`docs/SEO_prompt.md`](../../../docs/SEO_prompt.md) — supplementary SEO writing guidance
- [`docs/CDLAjobs_Content_Machine_Step1_Spec.md`](../../../docs/) — the build spec this README implements (move it into `docs/` if not already there)

## Known limitations (v1)

- **GSC live API call is a TODO stub.** Wiring is in place; the actual
  inspection call will return `not implemented` until someone fills in
  `callUrlInspectionApi()`. Spec §12 flagged rate-limit verification as
  an open item; do it before flipping the switch.
- **No verified-data source yet.** `planDailyRun` is hard-coded to
  pass `hasVerifiedData: false`, so `requires_data=true` topics get
  deprioritized indefinitely. When a real pay/freight-data source
  comes online, plumb it into the orchestrator.
- **No competitor blocklist out of the box.** `blocked-terms.ts` is
  empty until the owner adds names.
- **Inline `[LINK: anchor -> target]` markers are stripped from the
  published body.** The structured `internalLinks` array on the
  article row preserves them for human review; a future iteration
  could convert them into real `<Link>` elements.
- **Vercel cron is UTC-only.** The cron fires at `0 17 * * *` (5pm UTC
  ≈ 10am MST / 11am MDT) and shifts an hour twice a year across DST.
- **One Anthropic call per article, in parallel.** Fine for daily
  count 1–4 inside the 300s Hobby tier function timeout. At ramp 5+
  consider chunking or moving to a background worker pattern.
- **Slug-collision handling is bounded to 20 suffix attempts.** If a
  topic legitimately reaches 20 published variants under the same
  slug stem, the run fails loudly rather than silently choosing #21.
