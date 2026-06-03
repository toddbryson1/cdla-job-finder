# Cloud dev environment

This `.devcontainer/` lets you develop **cdla-job-finder** in **GitHub Codespaces**
instead of on your laptop. `next dev`, Node, and Postgres all run on GitHub's
hardware; your Mac only runs the editor and a browser tab.

## What boots automatically

- **Node 20** app container + **Postgres 16** container (`db` service)
- `DATABASE_URL` is preset to the in-container DB:
  `postgres://postgres:postgres@db:5432/cdla_dev`
- On create: `npm install` → `npm run db:migrate` → `npm run db:seed`

You only need to start the dev server:

```bash
npm run dev
```

Codespaces forwards port **3000** and opens a preview tab.

## Launching a Codespace

1. Push this branch to GitHub (it's `origin` already).
2. On github.com → the repo → **Code ▸ Codespaces ▸ Create codespace**.
   (Or VS Code locally: **Codespaces: Create New Codespace**.)
3. Wait for `postCreateCommand` to finish, then `npm run dev`.

Free tier: 60 core-hours/month on a 2-core machine. **Stop the Codespace when
you're done** (Codespaces menu ▸ Stop) so it doesn't burn hours idle.

## Secrets (do this once)

The database works out of the box. Anything that talks to a third party needs a
secret. Set these at **GitHub → repo → Settings → Secrets and variables →
Codespaces** — they're injected as env vars automatically, never committed.

Add only what you actually exercise:

| Feature you're testing            | Env vars to add |
| --------------------------------- | --------------- |
| Auth / login (Stytch)             | `STYTCH_PROJECT_ID`, `STYTCH_SECRET`, `STYTCH_PUBLIC_TOKEN`, `NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN` |
| Transactional email (Resend)      | `RESEND_API_KEY`, `CDLA_SENDER_ADDRESS` |
| Carrier lead webhook (GHL)        | `GHL_API_TOKEN`, `GHL_LOCATION_ID`, `GHL_CARRIER_LEAD_WEBHOOK_URL`, `GHL_BRIEF_PDF_URL` |
| Content machine / LLM             | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` |
| File uploads (Vercel Blob)        | `BLOB_READ_WRITE_TOKEN` |
| Job polling (Adzuna)              | `ADZUNA_APP_ID`, `ADZUNA_APP_KEY` |
| Cron endpoint / admin / unsub     | `CRON_SECRET`, `ADMIN_TOKEN`, `UNSUBSCRIBE_SECRET` |
| App URL (links in emails, etc.)   | `NEXT_PUBLIC_APP_URL` |

The DB-driven slices (landing pages, intake, matching, dismissals) work without
any of these.

## Optional: use Neon instead of the in-container Postgres

The in-container DB is wiped on rebuild. To persist data across Codespaces — and
to give Vercel previews a real database too — point at a managed Postgres:

1. Create a free project at https://neon.tech and copy the connection string.
2. Add `DATABASE_URL` as a **Codespaces secret** (GitHub → repo → Settings →
   Secrets and variables → Codespaces) with the Neon string.

That's it — `docker-compose.yml` uses `${DATABASE_URL:-<in-container db>}`, so the
secret automatically overrides the local DB. No file edits needed. Rebuild the
Codespace, then run `npm run db:migrate` (and `npm run db:seed` for example data).

The in-container `db` service still starts but goes unused; you can delete it from
`docker-compose.yml` if you've fully moved to Neon.
