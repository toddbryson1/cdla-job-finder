@AGENTS.md

# CDLA.jobs — Project Guide for Claude Code

## What This Project Is

**CDLA.jobs** is a Class A CDL driver-matching platform. Two audiences, one product:

1. **Drivers** — fill out one 6-minute intake. The matching engine runs their profile against
   carriers actively hiring their equipment in their region. Drivers pick which carriers see
   their info. Carriers contact them directly to start the application.
2. **Carriers** — Tier 2 free (matched leads + free Tenstreet integration) or Tier 1 $2,500/mo
   (24-hour exclusivity window, priority placement, QBR). No per-lead or per-hire fees on either tier.

## Source-of-Truth Docs

Canonical product/copy specs live in `docs/`:

- `docs/CDLAjobs_Driver_Landing_Page_Template.docx` — variable-driven landing pages at `/jobs/[region]-[equipment]`. Section 17 is explicit: **do not improvise headlines or microcopy** — the doc is the canonical version.
- `docs/CDLAjobs_Video_Script_Template.docx` — 6 short-form video script templates that drive traffic to those landing pages.
- `docs/CDLAjobs_Carrier_Pitch_Deck_Outline.docx` — 13-slide B2B carrier sales deck outline.

When changing copy on the landing pages or video scripts, update these `.docx` files (or extract markdown alongside them) so the source of truth stays in one place.

## Current State

Most of the original roadmap is built and running against a real Postgres DB. The slices below are
in production; see "What to Build Next" for the remaining gaps.

**Driver-facing landing pages** (`/jobs/[slug]`, `/carriers/[slug]`, `/articles/[slug]`)
- `src/app/jobs/[slug]/page.tsx` — dynamic per-job landing page; `src/components/JobsLandingPage.tsx` is the homepage layout
- `src/lib/page-data.ts`, `src/lib/slugs.ts`, `src/lib/regions.ts` — slug/region resolution + SEO metadata
- ISR per the template doc; `generateStaticParams` prerenders combos with live jobs

**Driver intake — "Debbie" conversational AI** (`/intake` → `/api/debbie/*`)
- `src/components/DebbieIntakeChat.tsx` + `src/lib/debbie/` — multi-turn Claude chat replaces the old static form
- Resume parsing (`parse-resume.ts`): PDF/DOCX/TXT/JPEG/PNG/WebP + HEIC/HEIF (transcoded to JPEG server-side)
- Audio transcription via Whisper (`transcribe.ts`); zod schemas in `src/lib/intake-schema.ts`
- 6 mandatory safety questions still verbatim from pitch deck slide 6

**Matching engine** (`src/lib/matching/`) — hard filters (CDL state, experience paths, OTR invariant,
equipment, home-time, endorsements, pay, SAP, DUI/felony, PostGIS polygon hiring areas), soft-rank
scoring, Tier-1 exclusivity gates. Has unit tests.

**Matches + application handoff** — `/matches/[driverId]`, `/match/[driverId]/[jobId]/apply` (Stage 2
consent + TCPA opt-in), persisted in `driver_carrier_matches` / `driver_carrier_applications`. Partner
handoff to Anderson/Sterling via QuickBase (`src/lib/quickbase/`) with a retry sweeper.

**Auth** — Stytch passwordless (email/SMS OTP), `src/lib/stytch/`, `/login`, `/me` driver dashboard.

**Carrier-facing** — `/carriers`, `/carriers/[slug]`, `/partners/*` (brief intake, integration docs, exclusivity).

**Growth/ops systems** — content machine (auto article generation + GSC/IndexNow, `src/lib/content-machine/`),
external jobs via Adzuna (`src/lib/external-jobs/`), Transport America sheet sync (`src/lib/transport-america/`),
GHL email (nurture / reverse-match / nudge sequences), funnel analytics (`src/lib/funnel-events/`),
CAN-SPAM unsubscribe, CCPA delete flow, and an admin dashboard at `/admin`.

Cron entrypoints live under `src/app/api/cron/*` (daily orchestrator, nurture, reverse-matches, qb-retry, sync-swift).

## Database

Postgres 16, Drizzle ORM, postgres-js driver. 34 migrations applied (`drizzle/`, 0000–0033).

```bash
npm run db:generate                 # generate migration after schema change (see caveat below)
npm run db:migrate                  # apply pending migrations
npm run db:seed                     # wipe + insert composite example carriers
npm run db:studio                   # browse with Drizzle Studio
```

> **Codespace caveat:** `npm run db:generate` fails in the Codespace (no TTY). Hand-author the SQL
> migration + journal entry instead. See `scripts/` helpers and memory `migration-workflow`.

`DATABASE_URL` lives in `.env.local` (gitignored).

Schema (`src/db/schema.ts`) — ~30 tables. The core ones:

| Table                        | Purpose                                                        |
| ---------------------------- | -------------------------------------------------------------- |
| `carriers`                   | Carrier master. `kind` = `partner` \| `prospect` \| `subscription`; `tier` = `tier_1` \| `tier_2`. Holds `partner_handoff_config` (Anderson QuickBase). |
| `carrier_jobs`               | Active job postings: hard filters, soft prefs, application surface, geospatial (lat/lng + PostGIS polygon), external/Tenstreet IDs. (Replaced the old `carrier_hiring_rules`.) |
| `drivers`                    | One row per intake. 6 safety questions, consent flags, preferences, address, last-seen/deleted-at. |
| `driver_carrier_matches`     | Persisted match record (soft-rank score, distance, first-seen). |
| `driver_carrier_applications`| Stage 2 consent per (driver, job) with TCPA opt-in. |
| `partner_application_stages` | State machine for the Anderson/Sterling QuickBase handoff. |
| `funnel_events`              | Append-only analytics log (intake_completed, matches_viewed, consent_submitted). |

Plus: nurture/nudge/reverse-match send tracking, content-machine tables (articles/topics/regions/runs),
external jobs (Adzuna cache + impressions), pending-carrier ingestion, posting cycles, zip codes,
dismissals, and Transport America sync mappings.

## Stack

- **Next.js 16** (App Router, React 19) — note: `params` is `Promise<…>`, must be awaited
- **Tailwind v4** — CSS-first config via `@theme` in `src/app/globals.css` (no `tailwind.config.ts`)
- **TypeScript** strict
- **Inter** font via `next/font/google`

## Brand Tokens

Defined as CSS variables in `src/app/globals.css` and exposed as Tailwind utilities (`bg-brand-deep`, `text-brand-gold`, etc.):

| Token            | Value     | Source                |
| ---------------- | --------- | --------------------- |
| `--brand-deep`   | `#1F3A5F` | docs (deep blue)      |
| `--brand-medium` | `#2E5C8A` | docs (medium blue)    |
| `--brand-gold`   | `#D4A017` | docs (accent gold)    |
| `--brand-ink`    | `#0f1419` | body text             |
| `--brand-muted`  | `#5b6573` | secondary text        |
| `--brand-rule`   | `#e5e9ef` | borders               |
| `--brand-surface`| `#f7f8fa` | subtle surface fill   |

## Voice Rules (from Brand Voice Guide, summarized in the docs)

- **Driver-facing pages**: warm, driver-first, light sarcasm aimed at Indeed / lead farms is fine. Never sarcastic at the driver.
- **Carrier-facing material**: professional, credible. No sarcasm. Specific over vague.
- **Always**: no emojis. No "guaranteed" anything. No fake numbers — if a variable resolves to null, follow the fallback rules in landing-page template Section 14.

## Common Commands

```bash
cd ~/projects/cdla-job-finder
npm run dev      # http://localhost:3000
npm run build    # also runs typecheck via Next's build
npm run lint
```

## What to Build Next

The original roadmap (matching engine, carrier pages, match tracking, auth) is **done**. Remaining work:

**Launch-blocking**
1. **Anderson/Sterling QuickBase handoff is on placeholders.** `src/lib/quickbase/client.ts` still has two
   spec-referenced TODOs awaiting Sterling: experience-level dropdown values (§B10 Q3) and the field-id-keyed
   payload map + table DBID (§B5.2) — plus the QuickBase User Token and attorney §B11 clearance. Records
   won't land in their system until those arrive. (Company name, recruiter, and min-experience are resolved.)

**Done since the original roadmap**
- Rate limiting on magic-link send + carrier-lead (Postgres fixed-window limiter).
- SMS step-up OTP before Stage 2 consent (`STEP_UP_OTP_ENABLED`, flag-gated off).
- Video script generator — `src/lib/video-scripts/` + `npm run gen:video-scripts` (CLI; renders the 6
  templates from the docx against live DB values, skips templates with null vars).

**Deferred / not started**
2. **Tenstreet feed ingestion** — handoff/IntelliApp linking works; the inbound feed sync runner does not exist (schema is prepped).
3. **Content-machine GSC URL inspection** — implemented (`src/lib/content-machine/gsc.ts`, shared auth in `src/lib/google-auth.ts`). Dormant until you verify the cdla.jobs property in Search Console, grant the service account access, and set `GSC_INTEGRATION_ENABLED=true`.
4. **Generated-script tracking table** — video-script v1 is generate-to-text only; a table tracking which
   scripts became videos + per-template conversion is the documented next step (docs §14).
5. Smaller TODOs: partner pitch-deck PDF export + calendar booking on `/partners/integration` (needs a
   chosen tool + the PDF asset), split contact addresses (drivers@/partners@/press@ — needs the mailboxes).
