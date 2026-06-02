# PAM Transport — operator overrides

## IntelliApp URL

```
https://intelliapp.driverapponline.com/c/dlmprofessional?r=POWERHOUSE&release_signature_screen_submit_without_signing=y&uri_b=ia_dlmprofessional_1196100671
```

**Why this URL is special** — PAM applies through Todd's **DLM Professional**
Tenstreet funnel rather than PAM's own Tenstreet account, so the URL points
at `/c/dlmprofessional`, not `/c/pam` or similar.

| Param | Value | Meaning |
|---|---|---|
| `c` (path) | `dlmprofessional` | DLM Professional Tenstreet account |
| `r` | `POWERHOUSE` | Recruiter code — attributes the lead to PHTP / Powerhouse Truck Pros |
| `release_signature_screen_submit_without_signing` | `y` | Tenstreet param that lets the driver submit without a signature screen |
| `uri_b` | `ia_dlmprofessional_1196100671` | Source identifier for Tenstreet-side tracking |

## How the override gets applied

1. **Discovery (automatic via Adzuna)** — when Adzuna's next sweep surfaces a
   PAM job, the carrier-discovery pipeline creates a `pending_carriers` row
   (or matches against an existing one, case-insensitive on the name).
2. **Override propagation** — at promote time, the bulk-promote CLI applies
   `pending_carriers.apply_url_override` to every `carrier_jobs.application_url`
   it creates for that carrier.
3. **Manual nudge** — `scripts/set-intelliapp.ts --name "<exact name>" --url "<URL above>"`
   updates the override on the live `pending_carriers` row + back-fills every
   currently-staged `pending_carrier_jobs` row + propagates to live
   `carrier_jobs` if the carrier has already been promoted.

## Pre-seeded state on prod (as of 2026-06-02)

Row pre-inserted into `pending_carriers` so the override is in place the
moment Adzuna catches PAM:

```
id     = 8a551e02-c4b5-46b7-bbe1-b482f65caac6
name   = Pam Transport
status = pending
apply_url_override = <the URL above>
```

**If Adzuna uses a different canonical name** (e.g. `PAM Transportation
Services Inc.` or `P.A.M. Transport, Inc.`), the case-insensitive unique
index on `lower(name)` will cause Adzuna to insert a SECOND row. In that
case:

```bash
# Find the row Adzuna actually created
psql $DATABASE_URL -c "SELECT id, name FROM pending_carriers WHERE name ILIKE '%pam%';"

# Re-run set-intelliapp with that exact name
npx tsx scripts/set-intelliapp.ts \
  --name "<exact name Adzuna used>" \
  --url "https://intelliapp.driverapponline.com/c/dlmprofessional?r=POWERHOUSE&release_signature_screen_submit_without_signing=y&uri_b=ia_dlmprofessional_1196100671"

# Then delete the orphaned pre-seeded row
psql $DATABASE_URL -c "DELETE FROM pending_carriers WHERE id = '8a551e02-c4b5-46b7-bbe1-b482f65caac6';"
```

## Kind / promote target

PAM is being routed through the DLM Professional funnel with a PHTP
recruiter code — that's a `partner` relationship, not `prospect`. When
promoting from `pending_carriers` to live `carriers`, set:

```
kind = partner
tier = none   -- bump to tier_1 / tier_2 if they subscribe
```
