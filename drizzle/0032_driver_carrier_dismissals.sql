-- Driver-initiated "not interested in this carrier" dismissals.
--
-- Scoped to CARRIER, not job — most drivers' rejection signal is
-- "I don't want to drive for Swift" rather than "I don't want this
-- specific Swift dedicated lane." Dismissing a carrier hides all of
-- their matching jobs from the driver's view (chat + /matches) and
-- keeps them out of "Apply to next" suggestions.
--
-- Soft state — not a hard ban. The driver can un-dismiss from /me
-- and the carrier re-appears on the next match render. Same row
-- gets used (UNIQUE on driver_id, carrier_id); we just delete the
-- row on un-dismissal so the (no row) state cleanly means "active."
--
-- We do NOT join this into the matching engine's hard filter —
-- matchDriver still computes the full match set, and the view
-- layers (/api/match enrichment + /matches page) filter it out.
-- That keeps reverse-match alerts working for dismissed carriers:
-- if a driver dismissed Swift but a NEW Swift job appears, the
-- alert still fires (matchedAt tracking is on driverCarrierMatches
-- which we still write). That's correct behavior — dismissing
-- yesterday's Phoenix lane shouldn't suppress next month's Atlanta
-- one.

CREATE TABLE "driver_carrier_dismissals" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "driver_id" uuid NOT NULL REFERENCES "drivers"("id") ON DELETE CASCADE,
        "carrier_id" uuid NOT NULL REFERENCES "carriers"("id") ON DELETE CASCADE,
        "dismissed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX "driver_carrier_dismissals_driver_carrier_uniq"
        ON "driver_carrier_dismissals" ("driver_id", "carrier_id");

CREATE INDEX "driver_carrier_dismissals_driver_idx"
        ON "driver_carrier_dismissals" ("driver_id", "dismissed_at");
