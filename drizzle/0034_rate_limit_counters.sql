-- Fixed-window rate-limit counters.
--
-- The app runs on Vercel serverless, where in-memory counters don't
-- survive across lambda instances. Abuse throttling therefore lives in
-- Postgres, the only shared durable store we have.
--
-- One row per (bucket, window_start). `bucket` namespaces the limit and
-- its subject (e.g. "login_email:foo@bar.com", "login_ip:1.2.3.4",
-- "carrier_lead_ip:1.2.3.4"). `window_start` is now() floored to the
-- window size, so a single atomic upsert records the hit AND returns the
-- running total:
--
--   INSERT INTO rate_limit_counters (bucket, window_start, count)
--   VALUES ($1, $2, 1)
--   ON CONFLICT (bucket, window_start)
--   DO UPDATE SET count = rate_limit_counters.count + 1
--   RETURNING count;
--
-- See src/lib/rate-limit. Old windows are pruned by the daily cron.

CREATE TABLE "rate_limit_counters" (
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_counters_bucket_window_start_pk" PRIMARY KEY("bucket","window_start")
);

CREATE INDEX "rate_limit_counters_window_idx"
	ON "rate_limit_counters" ("window_start");
