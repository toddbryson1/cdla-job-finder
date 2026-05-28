-- Hero + inline images for content-machine articles.
-- Two images per article:
--   1. hero       — large 16:9 right under the H1
--   2. inline     — square or 4:3 inserted ~50% through the body
-- All columns nullable so existing articles (and any future image-gen
-- failures) don't break rendering.

ALTER TABLE "articles"
  ADD COLUMN "hero_image_url" text,
  ADD COLUMN "hero_image_prompt" text,
  ADD COLUMN "inline_image_url" text,
  ADD COLUMN "inline_image_prompt" text;
