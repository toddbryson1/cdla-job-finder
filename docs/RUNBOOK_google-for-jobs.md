# Connecting CDLA.jobs to Google for Jobs

Google for Jobs is the search experience that surfaces "CDL Class A
Driver jobs Phoenix" results in a card at the top of Google. There's
no API to "list" jobs there — Google's crawler picks up JobPosting
structured data from our pages. Two pieces make it work:

1. **Search Console verification + sitemap** — tells Google we own
   the site and where to find listings.
2. **Indexing API** — pushes URL_UPDATED / URL_DELETED notifications
   so cycles get indexed within hours instead of waiting for crawl.
   Critical because each posting only lives 20 days.

This is a one-time setup. After it's done the daily cron handles the
ongoing work.

---

## 1. Verify the domain in Google Search Console

1. Go to https://search.google.com/search-console.
2. Click **Add property** → choose **URL prefix** → enter
   `https://cdla.jobs` (use https + apex, not www).
3. Pick **HTML tag** verification.
4. Copy the value from the `content="…"` attribute. Just the value,
   not the full `<meta>` tag.
5. In Vercel → Project Settings → Environment Variables, add
   `GOOGLE_SITE_VERIFICATION` with that value. Apply to **Production**.
6. Redeploy (or push any change — Vercel auto-redeploys).
7. Back in Search Console, click **Verify**.

Verification status: in `src/app/layout.tsx`, the `verification.google`
field on the root metadata renders `<meta name="google-site-verification">`
when the env var is present.

---

## 2. Submit the sitemap

Once verified:

1. Search Console → **Sitemaps** (left nav).
2. Add a new sitemap: `sitemap.xml` (just that — Search Console
   resolves it against the property URL).
3. Status should flip to **Success** within a few minutes. Google will
   start crawling the URLs listed there.

The sitemap is regenerated every 15 minutes from `src/app/sitemap.ts`
and includes one URL per active posting cycle.

---

## 3. Set up the Indexing API

The Indexing API is approved by Google only for JobPosting and
BroadcastEvent URLs (which we satisfy). It lets us push freshness
notifications instead of waiting for crawl.

### Create a service account

1. Go to https://console.cloud.google.com.
2. Create a new project named something like `cdla-jobs-indexing`.
3. Enable **Indexing API** for the project (search the API library).
4. **IAM & Admin** → **Service Accounts** → **Create service account**.
   Name: `cdla-indexing`. No roles required at the project level.
5. On the new service account → **Keys** → **Add key** → **Create new
   key** → **JSON**. Download the file. Treat it like a password.

### Add the service account as a Search Console owner

The Indexing API requires the service account to be an *Owner* of the
Search Console property — read/write isn't enough.

1. Search Console → **Settings** → **Users and permissions** →
   **Add user**.
2. Email: the service account email from the JSON file
   (`client_email`, looks like `cdla-indexing@cdla-jobs-indexing.iam.gserviceaccount.com`).
3. Permission: **Owner** (not "Full" — Owner).

### Wire credentials into Vercel

1. Open the JSON key file. Copy the **entire contents** (it's a JSON
   object — multiple lines).
2. Vercel → Project Settings → Environment Variables → Add
   `GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY`. Paste the JSON as a single
   value. Vercel handles multi-line values; no base64 encoding needed.
3. Apply to **Production** only (the local DB has no production
   cycles to publish).
4. Redeploy.

### Verify it works

The next time `/api/cron/daily` runs (or you trigger it manually from
Vercel → Cron Jobs → Run), the response JSON includes:

```json
{
  "postingCycles": {
    "ok": true,
    "expired": 3,
    "spawned": 5,
    "indexingPublished": 8,
    "indexingFailed": 0,
    "indexingSkipped": false
  }
}
```

`indexingPublished` should equal `expired + spawned`. If
`indexingFailed > 0`, check the Vercel function logs for the response
body — Google returns a clear error message.

If `indexingSkipped: true`, the env var isn't set or isn't valid JSON.

---

## 4. Verify JobPosting structured data is being read correctly

Once a few cycles have been indexed (give it 24-48 hours after the
first publish), spot-check with Google's official validator:

1. Pick any `/job/[slug]` URL from the sitemap.
2. Paste it into https://search.google.com/test/rich-results.
3. Should show "Job postings" detected with no errors and ideally no
   warnings. Warnings on optional fields (logo, applicantLocationRequirements)
   are fine.

You can also check coverage in Search Console → **Enhancements** →
**Job postings** once enough URLs have been indexed.

---

## Daily quotas

The Indexing API has a 200-call/day default quota. Each cycle that
spawns or expires uses 1 quota call. At 11 active jobs × 3 cycles
each on a 20-day window, that's ~30 calls/day at steady state. Plenty
of headroom.

If you ever expand to thousands of carriers, request a quota
increase through Search Console (it's automatic for sites with proven
JobPosting usage).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `indexingSkipped: true` in cron output | Env var missing or invalid JSON | Re-paste the service account JSON in Vercel |
| `403 PERMISSION_DENIED` in failed publishes | Service account not Owner of Search Console property | Re-check step 3.2 — must be **Owner** not "Full" |
| `404 NOT_FOUND` from publish | URL returns non-200 or missing JobPosting JSON-LD | Spot-check the URL with rich-results test; usually means the cycle row is somehow already gone |
| Sitemap shows "Couldn't fetch" in Search Console | Hitting a deploy mid-build | Wait 5 min, click **Refresh** |
| Google Search Console says "Site not verified" after env var set | Vercel didn't redeploy | Push any commit or click **Redeploy** in Vercel |

---

## What this gets us

- Indexing-API-pushed URLs typically appear in Google for Jobs within
  4-6 hours of publish (vs. 3-7 days for crawl-only).
- Each city in the cycle pool is a separate URL Google ranks
  independently — same job, three SERP slots in three metro areas.
- 20-day expiration + fresh `datePosted` on each repost keeps our
  listings perpetually "new" by Google's freshness signal.
- The `validThrough` date matches the cycle's `expires_at`, so Google
  drops expired URLs cleanly from the index instead of guessing.
