-- Append-only funnel event log.
--
-- The admin funnel queries (admin/dashboard-queries.ts) reconstruct
-- conversion from the durable state tables — applications, matches,
-- partner stages. That's great for "how many drivers consented" but
-- can't answer time-ordered drop-off questions: "a driver landed on
-- /matches with N matches at T and never consented." Those moments
-- aren't a state transition on any existing row, so they leave no
-- trace today.
--
-- This table records them as discrete, timestamped events. It holds
-- NO PII — driver_id + counts + a shallow metadata bag only — so it
-- survives the CCPA soft-delete anonymization exactly like matches
-- and applications do: the anonymized driver row keeps the FK intact
-- for aggregate analysis. The FKs are ON DELETE SET NULL as a guard
-- for any future HARD delete; today drivers are only soft-deleted.
--
-- event_type is open text on purpose — new call sites add values
-- without a migration. The emitted-today set is pinned by the
-- FunnelEventType union in src/lib/funnel-events.

CREATE TABLE "funnel_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"driver_id" uuid REFERENCES "drivers"("id") ON DELETE SET NULL,
	"event_type" text NOT NULL,
	"match_count" integer,
	"carrier_id" uuid REFERENCES "carriers"("id") ON DELETE SET NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "funnel_events_type_created_idx"
	ON "funnel_events" ("event_type", "created_at");

CREATE INDEX "funnel_events_driver_idx"
	ON "funnel_events" ("driver_id", "created_at");
