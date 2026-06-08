// Google Search Console URL Inspection — DORMANT SCAFFOLD per spec §5.3.
//
// When GSC_INTEGRATION_ENABLED=true, the daily cron processes due rows
// in article_index_status (queued 1/3/7 days after each publish) by
// calling the URL Inspection API and recording coverageState. When
// false (default), every entry point here is a no-op and the daily
// email shows "GSC integration: not configured".
//
// The live API call uses the shared service-account auth in
// src/lib/google-auth.ts with the read-only Search Console scope. It
// stays DORMANT regardless until two things are true at runtime:
//   1. GSC_INTEGRATION_ENABLED=true, AND
//   2. the cdla.jobs property is verified in Search Console and the
//      service-account email is granted access.
// Until both hold, runDueIndexChecks no-ops (flag) or the API returns a
// permission error that's recorded per-row (no fake success).
//
// Endpoint:
//   POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
//   { inspectionUrl, siteUrl, languageCode? }

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { articleIndexStatus, articles } from "@/db/schema";
import {
  getGoogleAccessToken,
  isServiceAccountConfigured,
} from "@/lib/google-auth";

const CHECK_DAYS: ReadonlyArray<number> = [1, 3, 7];

const URL_INSPECTION_ENDPOINT =
  "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect";
const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
// The Search Console property. Trailing slash matches the URL-prefix
// property registered in Search Console (vs. a Domain property).
const SITE_URL = process.env.GSC_SITE_URL?.trim() || "https://cdla.jobs/";

export function isGscEnabled(): boolean {
  return process.env.GSC_INTEGRATION_ENABLED === "true";
}

export interface DailyIndexSummary {
  configured: boolean;
  pendingAt3DaysOrMore: number; // articles published >=3d ago with no successful check yet
  pendingAt7DaysOrMore: number;
}

/**
 * Queue index-status checks at 1, 3, and 7 days after publish. Called
 * from the publish step regardless of whether GSC is enabled — keeping
 * the queue populated means flipping the switch on starts processing
 * existing articles' upcoming checks naturally.
 */
export async function enqueueIndexChecks(
  db: PostgresJsDatabase<Record<string, unknown>>,
  articleId: string,
  publishedAt: Date,
): Promise<void> {
  const values = CHECK_DAYS.map((days) => ({
    articleId,
    daysSincePublish: days,
    checkAt: new Date(publishedAt.getTime() + days * 24 * 60 * 60 * 1000),
  }));
  await db.insert(articleIndexStatus).values(values);
}

/**
 * Process due index-status checks. Returns the number processed.
 * No-op (returns 0) when GSC is disabled.
 */
export async function runDueIndexChecks(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<{ processed: number; failed: number }> {
  if (!isGscEnabled()) return { processed: 0, failed: 0 };

  // Pull rows whose checkAt has passed and which haven't been checked.
  const due = await db
    .select({
      id: articleIndexStatus.id,
      articleId: articleIndexStatus.articleId,
      daysSincePublish: articleIndexStatus.daysSincePublish,
    })
    .from(articleIndexStatus)
    .where(
      and(
        isNull(articleIndexStatus.checkedAt),
        lte(articleIndexStatus.checkAt, new Date()),
      ),
    )
    .limit(100);

  let processed = 0;
  let failed = 0;
  for (const row of due) {
    const url = await loadArticleUrl(db, row.articleId);
    if (!url) {
      await markChecked(db, row.id, null, null, "article URL not found");
      failed++;
      continue;
    }
    const result = await callUrlInspectionApi(url);
    if (result.ok) {
      await markChecked(
        db,
        row.id,
        result.coverageState ?? null,
        result.raw,
        null,
      );
      processed++;
    } else {
      await markChecked(db, row.id, null, null, result.error ?? null);
      failed++;
    }
  }
  return { processed, failed };
}

/**
 * Summary for the daily report. Counts published articles whose most
 * recent successful check at the 3d/7d milestone shows them not yet
 * indexed. When GSC isn't enabled, returns configured=false.
 */
export async function summarizeIndexStatus(
  db: PostgresJsDatabase<Record<string, unknown>>,
): Promise<DailyIndexSummary> {
  if (!isGscEnabled()) {
    return {
      configured: false,
      pendingAt3DaysOrMore: 0,
      pendingAt7DaysOrMore: 0,
    };
  }

  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const count = async (cutoff: Date): Promise<number> => {
    const rows = await db
      .select({ id: articles.id })
      .from(articles)
      .where(
        and(
          eq(articles.status, "published"),
          lte(articles.publishedAt, cutoff),
          // Either no checks recorded yet, or all coverageStates suggest non-indexed.
          sql`NOT EXISTS (
            SELECT 1 FROM ${articleIndexStatus}
            WHERE ${articleIndexStatus.articleId} = ${articles.id}
              AND ${articleIndexStatus.coverageState} ILIKE 'Submitted and indexed%'
          )`,
        ),
      );
    return rows.length;
  };

  return {
    configured: true,
    pendingAt3DaysOrMore: await count(threeDaysAgo),
    pendingAt7DaysOrMore: await count(sevenDaysAgo),
  };
}

async function loadArticleUrl(
  db: PostgresJsDatabase<Record<string, unknown>>,
  articleId: string,
): Promise<string | null> {
  const rows = await db
    .select({ url: articles.publishedUrl })
    .from(articles)
    .where(and(eq(articles.id, articleId), gt(articles.publishedAt, new Date(0))))
    .limit(1);
  return rows[0]?.url ?? null;
}

async function markChecked(
  db: PostgresJsDatabase<Record<string, unknown>>,
  rowId: string,
  coverageState: string | null,
  raw: unknown,
  error: string | null,
): Promise<void> {
  await db
    .update(articleIndexStatus)
    .set({
      checkedAt: new Date(),
      coverageState,
      rawResponse: raw as object | null,
      errorMessage: error,
    })
    .where(eq(articleIndexStatus.id, rowId));
}

interface UrlInspectionResult {
  ok: boolean;
  coverageState?: string;
  raw?: unknown;
  error?: string;
}

/**
 * Inspect one URL via the Search Console URL Inspection API and return
 * its coverageState. Uses the shared service-account auth (google-auth.ts)
 * with the read-only Search Console scope.
 *
 * Rate limit: ~2,000 requests/day per property. At 1–20 articles/day × 3
 * checks each we're at most ~60 calls/day — well under cap.
 *
 * Exported for unit testing; callers go through runDueIndexChecks.
 */
export async function callUrlInspectionApi(
  url: string,
): Promise<UrlInspectionResult> {
  if (!isServiceAccountConfigured()) {
    return {
      ok: false,
      error: "service account not configured (GOOGLE_INDEXING_SERVICE_ACCOUNT_KEY)",
    };
  }
  try {
    const token = await getGoogleAccessToken(GSC_SCOPE);
    const res = await fetch(URL_INSPECTION_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inspectionUrl: url, siteUrl: SITE_URL }),
      // Don't hang the cron if Google is slow.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `URL Inspection ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const json = (await res.json()) as {
      inspectionResult?: {
        indexStatusResult?: { coverageState?: string };
      };
    };
    const coverageState =
      json.inspectionResult?.indexStatusResult?.coverageState ?? undefined;
    return { ok: true, coverageState, raw: json };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
