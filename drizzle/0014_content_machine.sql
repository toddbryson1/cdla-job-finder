-- Content machine — tables backing the daily article-generation pipeline.
-- See CONTENT_MACHINE_README.md and docs/CDLAjobs_Daily_Article_Prompt.md.
--
-- Five tables:
--   1. article_topics          — seed list of topics per bucket
--   2. article_regions         — region rotation for daily article batch
--   3. articles                — one row per generated article
--   4. article_index_status    — GSC URL Inspection scaffold (dormant)
--   5. content_machine_state   — singleton bucket-skip cursor for count<4
--   6. content_machine_runs    — observability log for the daily run

CREATE TABLE "article_topics" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket" integer NOT NULL,
  "topic" text NOT NULL,
  "region_scoped" boolean DEFAULT false NOT NULL,
  "requires_data" boolean DEFAULT false NOT NULL,
  "last_used_at" timestamp with time zone,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "article_topics_bucket_range" CHECK ("bucket" BETWEEN 1 AND 4)
);

CREATE INDEX "article_topics_bucket_active_last_used_idx"
  ON "article_topics" ("bucket", "active", "last_used_at");

CREATE TABLE "article_regions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city" text NOT NULL,
  "state" varchar(2) NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "last_used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "article_regions_active_last_used_idx"
  ON "article_regions" ("active", "last_used_at");

CREATE TABLE "articles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "bucket" integer NOT NULL,
  "topic" text NOT NULL,
  "region" text,
  "title" text NOT NULL,
  "slug" text NOT NULL,
  "primary_keyword" text NOT NULL,
  "secondary_keywords" text[] DEFAULT '{}' NOT NULL,
  "title_tag" text NOT NULL,
  "meta_description" text NOT NULL,
  "body_markdown" text NOT NULL,
  "honest_caveat" text DEFAULT '' NOT NULL,
  "internal_links_json" jsonb,
  "cta_block" text DEFAULT '' NOT NULL,
  "faq_json" jsonb,
  "faq_schema_jsonld" text DEFAULT '' NOT NULL,
  "review_flags" text DEFAULT '' NOT NULL,
  "word_count" integer DEFAULT 0 NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "published_at" timestamp with time zone,
  "published_url" text,
  "llm_model" text NOT NULL,
  "status" text DEFAULT 'generated' NOT NULL,
  "failure_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "articles_bucket_range" CHECK ("bucket" BETWEEN 1 AND 4)
);

CREATE UNIQUE INDEX "articles_slug_uniq" ON "articles" ("slug");
CREATE INDEX "articles_status_idx" ON "articles" ("status");
CREATE INDEX "articles_published_at_idx" ON "articles" ("published_at");
CREATE INDEX "articles_bucket_idx" ON "articles" ("bucket");

CREATE TABLE "article_index_status" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "article_id" uuid NOT NULL REFERENCES "articles"("id") ON DELETE CASCADE,
  "days_since_publish" integer NOT NULL,
  "check_at" timestamp with time zone NOT NULL,
  "checked_at" timestamp with time zone,
  "coverage_state" text,
  "raw_response" jsonb,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "article_index_status_pending_idx"
  ON "article_index_status" ("checked_at", "check_at");
CREATE INDEX "article_index_status_article_idx"
  ON "article_index_status" ("article_id");

CREATE TABLE "content_machine_state" (
  "id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
  "last_run_date" date,
  "last_bucket_cursor" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- Seed the singleton row so the selector can always UPDATE without first
-- checking for existence.
INSERT INTO "content_machine_state" ("id") VALUES (1);

CREATE TABLE "content_machine_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_date" date NOT NULL,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "status" text DEFAULT 'success' NOT NULL,
  "requested_count" integer DEFAULT 0 NOT NULL,
  "published_count" integer DEFAULT 0 NOT NULL,
  "failed_count" integer DEFAULT 0 NOT NULL,
  "skipped_count" integer DEFAULT 0 NOT NULL,
  "error_message" text
);

CREATE INDEX "content_machine_runs_date_idx"
  ON "content_machine_runs" ("run_date");
