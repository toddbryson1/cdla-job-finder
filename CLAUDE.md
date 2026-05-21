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

Two slices working end-to-end against a real Postgres DB:

**Driver-facing landing pages** (`/jobs/[region-equipment]`)
- `src/app/jobs/[slug]/page.tsx` — dynamic route, slug is `<region>-<equipment>` (e.g. `atlanta-reefer`)
- `src/components/JobsLandingPage.tsx` — Hero / Trust signals / How it works / Pay / FAQ / Final CTA / Footer
- `src/lib/slugs.ts` — region and equipment slug maps + `parseJobSlug`
- `src/lib/page-data.ts` — resolves all template variables (Section 2.4 of the landing-page doc) via Drizzle queries against `carriers`, `carrier_hiring_rules`, and `drivers`
- ISR via `export const revalidate = 900` (15 minutes — per template doc)
- `generateStaticParams` prerenders the (region, equipment) combos that actually have hiring rules in the DB

**Driver intake** (`/intake` → `/api/intake` → `/intake/done`)
- 4-step form in `src/components/IntakeForm.tsx` (client component)
- Zod schema in `src/lib/intake-schema.ts` shared between client and server
- API route validates with Zod and inserts into `drivers`
- 6 mandatory safety questions verbatim from pitch deck slide 6

Not yet built: matching engine, carrier portal, Tenstreet integration, auth, video script generator. The pitch-deck outline is a content asset.

## Database

Local Postgres 16 via Homebrew. Drizzle ORM, postgres-js driver.

```bash
brew services start postgresql@16   # if not already running
npm run db:generate                 # generate migration after schema change
npm run db:migrate                  # apply pending migrations
npm run db:seed                     # wipe + insert composite example carriers
npm run db:studio                   # browse with Drizzle Studio
```

`DATABASE_URL` lives in `.env.local` (gitignored). Default: `postgres://toddbryson@localhost:5432/cdla_dev`.

Schema (`src/db/schema.ts`):

| Table                  | Purpose                                                        |
| ---------------------- | -------------------------------------------------------------- |
| `carriers`             | Each carrier we work with. `kind` = `partner` \| `prospect`, `tier` = `tier_1` \| `tier_2`. |
| `carrier_hiring_rules` | One row per (carrier, region, equipment) the carrier hires for, plus pay range, home time, and what they tolerate (DUI/felony/failed DOT). |
| `drivers`              | One row per intake submission. All 6 safety questions, consent flags, full preferences. |

Stat proxies (until more data is captured):
- `driver_count_in_region` uses `cdl_state` as a proxy for `address_state` (intake doesn't collect home address)
- `avg_match_count` and `recent_hire_count` are 0 until the matching engine + hire tracking land

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

In rough order, matching the docs:

1. **Matching engine** — given a driver row, return the carrier hiring rules that fit. Drives the "X drivers match Y carriers" stats and unblocks the matched-leads email.
2. **Carrier-facing pages** — `/carriers` with the Tier comparison from the pitch deck (B2B voice, not driver voice).
3. **Match tracking** — `driver_carrier_matches` table so `avg_match_count` and `recent_hire_count` stats are real.
4. **Tenstreet integration** — partner-confirmation flow + lead submission. Doc covers the spec.
5. **Video script generator** — tool that renders the 6 templates from `docs/CDLAjobs_Video_Script_Template.docx` against real DB values. CLI for now, not a UI feature.
6. **Auth** — driver login to see their matches, carrier login to manage hiring rules.
