// Google Search Console URL Inspection — DORMANT SCAFFOLD per spec §5.3.
//
// When GSC_INTEGRATION_ENABLED=true, the daily cron processes due rows
// in article_index_status (queued 1/3/7 days after each publish) by
// calling the URL Inspection API and recording coverageState. When
// false (default), every entry point here is a no-op and the daily
// email shows "GSC integration: not configured".
//
// The live API call is intentionally not yet implemented — spec §12
// flags "GSC URL Inspection API rate limits: must be verified against
// current Google docs" as an open item, and the property isn't
// verified yet. When the owner is ready, fill in callUrlInspectionApi()
// using the JWT auth pattern in src/lib/google-indexing.ts (the only
// differences are the endpoint and the OAuth scope —
// https://www.googleapis.com/auth/webmasters.readonly).
//
// Endpoint:
//   POST https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
//   { inspectionUrl, siteUrl, languageCode? }

import { and, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { articleIndexStatus, articles } from "@/db/schema";

const CHECK_DAYS: ReadonlyArray<number> = [1, 3, 7];

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
 * TODO: implement when the owner verifies the cdla.jobs property in
 * Search Console and grants the service-account email access. Until
 * then this returns ok=false so the dormant scaffold logs but does
 * not pretend success.
 *
 * Implementation sketch (when ready):
 *   1. Reuse the JWT auth pattern in src/lib/google-indexing.ts but
 *      with scope "https://www.googleapis.com/auth/webmasters.readonly".
 *   2. POST to
 *        https://searchconsole.googleapis.com/v1/urlInspection/index:inspect
 *      with body { inspectionUrl: url, siteUrl: "https://cdla.jobs/" }.
 *   3. Pull inspectionResult.indexStatusResult.coverageState from the
 *      response. Common values: "Submitted and indexed", "Crawled — currently
 *      not indexed", "Discovered — currently not indexed", "URL is unknown
 *      to Google".
 *   4. Rate limit: ~2,000 requests/day per property. With 1–20 articles/day
 *      and 3 checks each, we're at most 60 calls/day — well under cap.
 */
async function callUrlInspectionApi(
  _url: string,
): Promise<UrlInspectionResult> {
  return {
    ok: false,
    error:
      "URL Inspection API call not implemented — see TODO in src/lib/content-machine/gsc.ts",
  };
}
