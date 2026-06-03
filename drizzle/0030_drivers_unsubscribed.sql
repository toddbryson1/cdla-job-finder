-- One-way unsubscribe flag. Set when a driver clicks the
-- unsubscribe link in any outbound CDLA.jobs email. Every runner
-- that sends to drivers (reverse-matches, application-nudges,
-- nurture-sends, candidate-email) checks this column and skips
-- unsubscribed drivers cleanly.
--
-- Source: the /unsubscribe page. Re-subscription is intentionally
-- NOT supported in v1 — a driver who wants email again can hit
-- /login and Debbie can offer it on a future surface. CAN-SPAM
-- only requires honoring opt-outs within 10 business days; never
-- re-subscribing without an affirmative new action is the safer
-- default.
--
-- The token used to verify the unsubscribe click is HMAC-derived
-- from the driver UUID + UNSUBSCRIBE_SECRET env var, so no token
-- column is needed.

ALTER TABLE "drivers"
        ADD COLUMN "unsubscribed_at" timestamp with time zone;

CREATE INDEX "drivers_unsubscribed_at_idx"
        ON "drivers" ("unsubscribed_at")
        WHERE "unsubscribed_at" IS NOT NULL;
