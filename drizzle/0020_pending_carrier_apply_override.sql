-- Per-pending-carrier IntelliApp URL override.
--
-- Adzuna's redirect_url is an Adzuna-hosted tracker that bounces to
-- the original posting. When we know the real Tenstreet IntelliApp
-- URL for a carrier (operator-provided), we want every job we stage
-- + promote to use that URL directly — that flips the
-- application_surface from `unknown` to `tenstreet_intelliapp` and
-- gives the driver a one-click apply path instead of bouncing
-- through an aggregator.
--
-- We store the override at the carrier level (not per-job) so it
-- survives crawler re-discoveries that replace the job set
-- wholesale. The persist + promote layers both read this column.

ALTER TABLE "pending_carriers"
        ADD COLUMN "apply_url_override" text;
