-- Generated video scripts (docs/CDLAjobs_Video_Script_Template.docx §14).
--
-- One row per (target slug, template). The generator CLI upserts the
-- rendered script so we can track which scripts exist, which have been
-- produced into video, and — later — which drove intakes. Re-running the
-- generator refreshes body/variables but preserves status (a script
-- marked "produced" isn't undone by the next generation).
--
-- See src/lib/video-scripts/store.ts.

CREATE TYPE "video_script_status" AS ENUM (
	'generated',
	'in_production',
	'published',
	'archived'
);

CREATE TABLE "video_scripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"region" text NOT NULL,
	"equipment" text NOT NULL,
	"template_key" text NOT NULL,
	"body" text NOT NULL,
	"variables" jsonb,
	"warnings" jsonb,
	"status" "video_script_status" DEFAULT 'generated' NOT NULL,
	"produced_video_url" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "video_scripts_slug_template_idx"
	ON "video_scripts" ("slug", "template_key");

CREATE INDEX "video_scripts_status_idx"
	ON "video_scripts" ("status");
