// Top-level orchestrator for the daily content-machine run. Called
// from /api/cron/daily as the 5th step in the master cron route.
//
// Flow (one daily invocation):
//
//   0. Read env config; if CONTENT_MACHINE_ENABLED!=true, log + return
//      a 'disabled' run record. No email sent (spec §2).
//   1. Plan: pick (bucket, topic, region) triples per spec §3
//   2. Generate articles in parallel (Promise.all)
//   3. For each: placeholder rewrite if needed, validate, publish or
//      mark failed
//   4. Persist last_used_at on topic/region/cursor
//   5. Run GSC due checks (no-op when GSC disabled)
//   6. Send daily report email (always, unless disabled)
//   7. Write content_machine_runs summary
//
// Failure handling (spec §8): each per-article step is wrapped in a
// retry-once-after-30s helper. Run-level catastrophic failures are
// caught at the top and sent as a separate "RUN FAILED" email.

import { eq } from "drizzle-orm";
import { db as defaultDb } from "@/db/client";
import { articles, contentMachineRuns } from "@/db/schema";
import { generateArticleImages } from "./images";
import {
  sendDailyReport,
  sendFailureEmail,
  type FailedRow,
  type PublishedRow,
  type RunStatus,
} from "./email-report";
import {
  enqueueIndexChecks,
  runDueIndexChecks,
  summarizeIndexStatus,
} from "./gsc";
import { submitToIndexNow } from "./indexnow";
import {
  generateArticle,
  rewriteToRemovePlaceholders,
  type GeneratedArticle,
} from "./llm";
import {
  advanceCursor,
  markRegionUsed,
  markTopicUsed,
  planDailyRun,
  type Bucket,
  type DailyCount,
} from "./select";
import {
  insertFailed,
  insertPublished,
  type PublishOutcome,
} from "./publish";
import { hasPlaceholder, validateAndFix } from "./validate";

const RETRY_DELAY_MS = 30_000;

type Db = typeof defaultDb;

export interface RunResult {
  status: RunStatus;
  date: string;
  requestedCount: number;
  publishedCount: number;
  failedCount: number;
  skippedCount: number;
  errorMessage?: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function readEnvCount(): DailyCount {
  const raw = process.env.CONTENT_MACHINE_DAILY_COUNT?.trim() || "1";
  const n = Number(raw);
  if (n === 1 || n === 2 || n === 3 || n === 4) return n;
  // Out of range → clamp to 1 and log; never crash on misconfig.
  console.warn(
    `[content-machine] CONTENT_MACHINE_DAILY_COUNT=${raw} out of [1,4]; clamping to 1`,
  );
  return 1;
}

function isEnabled(): boolean {
  // Default to disabled — explicit opt-in required so a stray deploy
  // doesn't start auto-publishing articles before the owner is ready.
  return process.env.CONTENT_MACHINE_ENABLED === "true";
}

/**
 * Retry-once-after-30s helper. Returns the value on success, throws
 * the last error on second failure. The 30s backoff is per spec §8.
 *
 * Override via the `delayMs` arg so tests don't wait 30 real seconds.
 */
export async function withRetryOnce<T>(
  fn: () => Promise<T>,
  delayMs = RETRY_DELAY_MS,
): Promise<T> {
  try {
    return await fn();
  } catch (firstErr) {
    await new Promise((r) => setTimeout(r, delayMs));
    try {
      return await fn();
    } catch (secondErr) {
      throw secondErr instanceof Error
        ? secondErr
        : new Error(String(secondErr));
    }
  }
}

interface ProcessResult {
  status: "published" | "failed" | "skipped";
  bucket: Bucket;
  topicId: string;
  topic: string;
  region: string | null;
  // Success fields
  published?: PublishOutcome & {
    title: string;
    wordCount: number;
    reviewFlags: string;
  };
  // Failure fields
  failed?: FailedRow;
}

/**
 * Per-article pipeline: generate → placeholder check (rewrite if
 * needed) → validate → publish OR insertFailed. Returns a uniform
 * ProcessResult the orchestrator uses to build the email.
 *
 * Throws only on truly unrecoverable errors; per-article failures are
 * captured as { status: 'failed' } records instead of bubbling up so
 * one bad article doesn't doom the day.
 */
async function processPick(
  db: Db,
  bucket: Bucket,
  topicId: string,
  topic: string,
  region: { city: string; state: string } | null,
): Promise<ProcessResult> {
  const regionLabel = region ? `${region.city}, ${region.state}` : null;
  let generated: GeneratedArticle;

  try {
    generated = await withRetryOnce(() =>
      generateArticle({
        bucket,
        topic,
        region,
        verifiedData: null,
      }),
    );
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : `LLM failure: ${String(err)}`;
    const ins = await insertFailed(db, {
      bucket,
      topic,
      region: regionLabel,
      llmModel:
        process.env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-4-6",
      status: "failed",
      failureReason: `Generation failed: ${reason}`,
    });
    return {
      status: "failed",
      bucket,
      topicId,
      topic,
      region: regionLabel,
      failed: {
        title: `[failed] Bucket ${bucket}: ${topic}`,
        bucket,
        reason: `Generation failed: ${reason}`,
      },
    };
  }

  // §4.2 placeholder handling
  let working = { ...generated };
  if (hasPlaceholder(working)) {
    try {
      const rewritten = await rewriteToRemovePlaceholders(
        working,
        generated.llmModel,
      );
      working = { ...working, ...rewritten };
    } catch (err) {
      const reason =
        err instanceof Error ? err.message : `rewrite failure: ${String(err)}`;
      await insertFailed(db, {
        bucket,
        topic,
        region: regionLabel,
        title: generated.workingTitle,
        slug: generated.slug,
        primaryKeyword: generated.primaryKeyword,
        titleTag: generated.titleTag,
        metaDescription: generated.metaDescription,
        bodyMarkdown: generated.bodyMarkdown,
        llmModel: generated.llmModel,
        status: "skipped",
        failureReason: `Placeholder rewrite failed: ${reason}`,
      });
      return {
        status: "skipped",
        bucket,
        topicId,
        topic,
        region: regionLabel,
        failed: {
          title: generated.workingTitle,
          bucket,
          reason: `Placeholder rewrite failed: ${reason}`,
        },
      };
    }
    if (hasPlaceholder(working)) {
      await insertFailed(db, {
        bucket,
        topic,
        region: regionLabel,
        title: generated.workingTitle,
        slug: generated.slug,
        primaryKeyword: generated.primaryKeyword,
        titleTag: generated.titleTag,
        metaDescription: generated.metaDescription,
        bodyMarkdown: working.bodyMarkdown,
        llmModel: generated.llmModel,
        status: "skipped",
        failureReason:
          "Placeholder still present after rewrite — skipped to avoid publishing [INSERT VERIFIED STAT].",
      });
      return {
        status: "skipped",
        bucket,
        topicId,
        topic,
        region: regionLabel,
        failed: {
          title: generated.workingTitle,
          bucket,
          reason: "Placeholder still present after rewrite",
        },
      };
    }
  }

  // §4.3 validation (+ in-place fixes for title/meta truncation)
  const validation = validateAndFix(working);
  if (!validation.ok) {
    await insertFailed(db, {
      bucket,
      topic,
      region: regionLabel,
      title: working.workingTitle,
      slug: working.slug,
      primaryKeyword: working.primaryKeyword,
      titleTag: working.titleTag,
      metaDescription: working.metaDescription,
      bodyMarkdown: working.bodyMarkdown,
      llmModel: generated.llmModel,
      status: "failed",
      failureReason: validation.failureReasons.join("; "),
    });
    return {
      status: "failed",
      bucket,
      topicId,
      topic,
      region: regionLabel,
      failed: {
        title: working.workingTitle,
        bucket,
        reason: validation.failureReasons.join("; "),
      },
    };
  }

  // Publish
  let publishOutcome: PublishOutcome;
  try {
    publishOutcome = await withRetryOnce(() =>
      insertPublished(db, {
        article: validation.fixedArticle,
        bucket,
        topic,
        region: regionLabel,
        wordCount: generated.wordCount,
        llmModel: generated.llmModel,
        extraReviewFlags: validation.warnings.join("\n"),
      }),
    );
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : `publish failure: ${String(err)}`;
    await insertFailed(db, {
      bucket,
      topic,
      region: regionLabel,
      title: working.workingTitle,
      slug: working.slug,
      primaryKeyword: working.primaryKeyword,
      titleTag: working.titleTag,
      metaDescription: working.metaDescription,
      bodyMarkdown: working.bodyMarkdown,
      llmModel: generated.llmModel,
      status: "failed",
      failureReason: `Publish failed: ${reason}`,
    });
    return {
      status: "failed",
      bucket,
      topicId,
      topic,
      region: regionLabel,
      failed: {
        title: working.workingTitle,
        bucket,
        reason: `Publish failed: ${reason}`,
      },
    };
  }

  // Post-publish side effects — best-effort, don't fail the article.
  const sideEffectNotes: string[] = [];

  try {
    await markTopicUsed(db, topicId);
  } catch (err) {
    console.warn(
      `[content-machine] markTopicUsed failed for ${topicId}: ${err}`,
    );
  }
  try {
    await enqueueIndexChecks(db, publishOutcome.articleId, new Date());
  } catch (err) {
    console.warn(`[content-machine] enqueueIndexChecks failed: ${err}`);
  }
  const indexNow = await submitToIndexNow([publishOutcome.publishedUrl]);
  if (!indexNow.ok) {
    console.warn(
      `[content-machine] IndexNow submission failed (${indexNow.status}): ${indexNow.body}`,
    );
  }

  // Image generation — also best-effort. If gpt-image-1 or Blob is
  // misconfigured, the article still publishes (renders without
  // images) and we surface the failure in reviewFlags. ISR
  // (revalidate=900) means a successful UPDATE will appear within
  // 15 min even though the row is already live.
  try {
    const images = await generateArticleImages({
      articleId: publishOutcome.articleId,
      topic,
      region: regionLabel,
      bucket,
    });
    await db
      .update(articles)
      .set({
        heroImageUrl: images.heroUrl,
        heroImagePrompt: images.heroPrompt,
        inlineImageUrl: images.inlineUrl,
        inlineImagePrompt: images.inlinePrompt,
        updatedAt: new Date(),
      })
      .where(eq(articles.id, publishOutcome.articleId));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[content-machine] image generation failed: ${msg}`);
    sideEffectNotes.push(`[images] generation failed: ${msg}`);
  }

  const finalReviewFlags = [
    validation.fixedArticle.reviewFlags,
    ...validation.warnings,
    ...sideEffectNotes,
  ]
    .filter((s) => s?.trim())
    .join("\n");

  return {
    status: "published",
    bucket,
    topicId,
    topic,
    region: regionLabel,
    published: {
      ...publishOutcome,
      title: validation.fixedArticle.workingTitle,
      wordCount: generated.wordCount,
      reviewFlags: finalReviewFlags,
    },
  };
}

export interface RunOptions {
  db?: Db;
  /** Override env count for testing/manual triggers. */
  countOverride?: DailyCount;
  /** Skip the daily email (useful for smoke testing). */
  skipEmail?: boolean;
}

export async function runContentMachine(
  opts: RunOptions = {},
): Promise<RunResult> {
  const db = opts.db ?? defaultDb;
  const today = new Date();
  const dateYmd = ymd(today);

  if (!isEnabled()) {
    // Spec §2 kill switch: log + exit without sending email.
    console.log("[content-machine] disabled (CONTENT_MACHINE_ENABLED!=true)");
    await db.insert(contentMachineRuns).values({
      runDate: dateYmd,
      completedAt: new Date(),
      status: "disabled",
    });
    return {
      status: "DISABLED",
      date: dateYmd,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
    };
  }

  const count = opts.countOverride ?? readEnvCount();

  try {
    const plan = await planDailyRun({
      db,
      count,
      hasVerifiedData: false, // v1: no verified data source yet
    });

    // Parallel generation per spec discovery answer (count<=4 fits in
    // one Vercel function with fluid compute's 300s default).
    const results = await Promise.all(
      plan.picks.map((pick) =>
        processPick(db, pick.bucket, pick.topic.id, pick.topic.topic, plan.region),
      ),
    );

    // Persist run-level state regardless of per-article outcomes.
    await advanceCursor(db, plan.cursorAfter, today);
    if (plan.region) {
      try {
        await markRegionUsed(db, plan.region.id);
      } catch (err) {
        console.warn(`[content-machine] markRegionUsed failed: ${err}`);
      }
    }

    // GSC scaffold processes any due rows (no-op when disabled).
    try {
      await runDueIndexChecks(db);
    } catch (err) {
      console.warn(`[content-machine] runDueIndexChecks failed: ${err}`);
    }

    const published: PublishedRow[] = results
      .filter((r): r is ProcessResult & { status: "published" } =>
        r.status === "published" && !!r.published,
      )
      .map((r) => ({
        title: r.published!.title,
        publishedUrl: r.published!.publishedUrl,
        bucket: r.bucket,
        wordCount: r.published!.wordCount,
        reviewFlags: r.published!.reviewFlags,
      }));

    const failed: FailedRow[] = results
      .filter((r) => r.status !== "published" && !!r.failed)
      .map((r) => r.failed!);

    const status: RunStatus =
      failed.length === 0
        ? "SUCCESS"
        : published.length === 0
          ? "FAILED"
          : "PARTIAL";

    const skippedCount = results.filter((r) => r.status === "skipped").length;
    const failedCount = results.filter((r) => r.status === "failed").length;

    // Write run-log row before sending the email so the row exists
    // even if Resend is down.
    await db.insert(contentMachineRuns).values({
      runDate: dateYmd,
      completedAt: new Date(),
      status: status.toLowerCase(),
      requestedCount: plan.picks.length,
      publishedCount: published.length,
      failedCount,
      skippedCount,
    });

    if (!opts.skipEmail) {
      const gsc = await summarizeIndexStatus(db);
      await sendDailyReport({
        dateYmd,
        dailyCount: count,
        status,
        published,
        failed,
        gsc,
        killSwitchEnabled: true,
      });
    }

    return {
      status,
      date: dateYmd,
      requestedCount: plan.picks.length,
      publishedCount: published.length,
      failedCount,
      skippedCount,
    };
  } catch (err) {
    // Catastrophic run failure — write a failed run row and fire the
    // separate RUN FAILED email per spec §6.
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[content-machine] run failed: ${errMsg}`, err);
    try {
      await db.insert(contentMachineRuns).values({
        runDate: dateYmd,
        completedAt: new Date(),
        status: "failed",
        errorMessage: errMsg.slice(0, 1000),
      });
    } catch (innerErr) {
      console.error(
        `[content-machine] also failed to record run-failed row: ${innerErr}`,
      );
    }
    try {
      await sendFailureEmail({
        dateYmd,
        error: err instanceof Error ? err : new Error(errMsg),
      });
    } catch (mailErr) {
      console.error(
        `[content-machine] also failed to send failure email: ${mailErr}`,
      );
    }
    return {
      status: "FAILED",
      date: dateYmd,
      requestedCount: 0,
      publishedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      errorMessage: errMsg,
    };
  }
}
