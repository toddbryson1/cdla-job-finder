// Publish step for the content machine. Takes a fully-generated +
// validated article, ensures the slug is unique, inserts the row with
// status='published', and returns the published URL.
//
// Slug uniqueness: checked against existing articles only. There's no
// other /articles/* route in the app at present, so the articles table
// is authoritative for what URLs are taken. If a collision is found we
// append a short numeric suffix (-2, -3, ...) and log it to the
// article's reviewFlags so the human reviewer sees what happened.

import { eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { articles } from "@/db/schema";
import type { ParsedArticle } from "./llm";

export const SITE_ORIGIN = "https://cdla.jobs";
export const ARTICLES_PATH = "/articles";

export interface InsertGeneratedInput {
  article: ParsedArticle;
  bucket: 1 | 2 | 3 | 4;
  topic: string;
  region: string | null;
  wordCount: number;
  llmModel: string;
  extraReviewFlags: string; // appended (truncation warnings, suffix note)
}

export interface PublishOutcome {
  articleId: string;
  finalSlug: string;
  publishedUrl: string;
  slugSuffixAppended: boolean;
}

/**
 * Append a numeric suffix until the slug is free. Bounded to 20 attempts
 * to fail loud if something is pathologically wrong.
 */
export async function findFreeSlug(
  db: PostgresJsDatabase<Record<string, unknown>>,
  desired: string,
): Promise<{ slug: string; suffixAppended: boolean }> {
  // First try: exact slug
  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(eq(articles.slug, desired))
    .limit(1);
  if (existing.length === 0) return { slug: desired, suffixAppended: false };

  for (let n = 2; n <= 20; n++) {
    const candidate = `${desired}-${n}`;
    const c = await db
      .select({ id: articles.id })
      .from(articles)
      .where(eq(articles.slug, candidate))
      .limit(1);
    if (c.length === 0) return { slug: candidate, suffixAppended: true };
  }
  throw new Error(`Could not find a free slug after 20 attempts: ${desired}`);
}

export function urlForSlug(slug: string): string {
  return `${SITE_ORIGIN}${ARTICLES_PATH}/${slug}`;
}

/**
 * Insert a fully-validated article with status='published' and
 * populated publishedAt/publishedUrl. Returns the row id and final URL.
 */
export async function insertPublished(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: InsertGeneratedInput,
): Promise<PublishOutcome> {
  const { article } = input;
  const { slug, suffixAppended } = await findFreeSlug(db, article.slug);
  const publishedUrl = urlForSlug(slug);
  const now = new Date();

  const reviewFlags = suffixAppended
    ? `${article.reviewFlags}\n\n[publish] slug collision: appended suffix to make "${slug}" unique.\n${input.extraReviewFlags}`.trim()
    : `${article.reviewFlags}\n${input.extraReviewFlags}`.trim();

  const inserted = await db
    .insert(articles)
    .values({
      bucket: input.bucket,
      topic: input.topic,
      region: input.region,
      title: article.workingTitle,
      slug,
      primaryKeyword: article.primaryKeyword,
      secondaryKeywords: article.secondaryKeywords,
      titleTag: article.titleTag,
      metaDescription: article.metaDescription,
      bodyMarkdown: article.bodyMarkdown,
      honestCaveat: article.honestCaveat,
      internalLinksJson: article.internalLinks,
      ctaBlock: article.ctaBlock,
      faqJson: article.faq,
      faqSchemaJsonld: article.faqSchemaJsonld,
      reviewFlags,
      wordCount: input.wordCount,
      llmModel: input.llmModel,
      status: "published",
      generatedAt: now,
      publishedAt: now,
      publishedUrl,
    })
    .returning({ id: articles.id });

  return {
    articleId: inserted[0].id,
    finalSlug: slug,
    publishedUrl,
    slugSuffixAppended: suffixAppended,
  };
}

/**
 * Insert an article that failed generation/validation. status='failed'
 * (or 'skipped' for placeholder-rewrite failures). Lets the daily
 * report surface what happened.
 */
export async function insertFailed(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    bucket: 1 | 2 | 3 | 4;
    topic: string;
    region: string | null;
    title?: string;
    slug?: string;
    primaryKeyword?: string;
    titleTag?: string;
    metaDescription?: string;
    bodyMarkdown?: string;
    llmModel: string;
    status: "failed" | "skipped";
    failureReason: string;
  },
): Promise<{ articleId: string }> {
  // Failed rows still need NOT NULL fields populated; fall back to
  // sensible placeholders rather than blocking on every missing field.
  // The slug uniqueness constraint must still be respected.
  const placeholderSlug =
    input.slug ?? `failed-${input.bucket}-${Date.now()}`;
  const inserted = await db
    .insert(articles)
    .values({
      bucket: input.bucket,
      topic: input.topic,
      region: input.region,
      title: input.title ?? `[failed] Bucket ${input.bucket}: ${input.topic}`,
      slug: placeholderSlug,
      primaryKeyword: input.primaryKeyword ?? input.topic,
      titleTag: input.titleTag ?? input.topic.slice(0, 60),
      metaDescription: input.metaDescription ?? input.topic.slice(0, 155),
      bodyMarkdown: input.bodyMarkdown ?? "",
      llmModel: input.llmModel,
      status: input.status,
      failureReason: input.failureReason,
    })
    .returning({ id: articles.id });

  return { articleId: inserted[0].id };
}

/**
 * Strip [LINK: anchor -> target page type] markers from body markdown
 * before public rendering. The structured internalLinks array on the
 * article row still has them for the human reviewer to act on later.
 * Preserves paragraph breaks; only collapses intra-line whitespace
 * left behind by the marker removal.
 */
export function stripLinkMarkers(body: string): string {
  return body
    .replace(/\[LINK:[^\]]*\]/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/ {2,}/g, " ")
        // Orphan space before punctuation from "word [LINK ...]." -> "word ."
        .replace(/ ([.,;:!?])/g, "$1")
        .trimEnd(),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

/**
 * Hit the Postgres SELECT to load a published article by slug. Returns
 * null if not found or not published. Used by the /articles/[slug]
 * page route.
 */
export async function loadPublishedArticle(
  db: PostgresJsDatabase<Record<string, unknown>>,
  slug: string,
) {
  const rows = await db
    .select()
    .from(articles)
    .where(sql`${articles.slug} = ${slug} AND ${articles.status} = 'published'`)
    .limit(1);
  return rows[0] ?? null;
}
