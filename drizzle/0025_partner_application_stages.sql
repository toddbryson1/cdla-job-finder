-- partner_application_stages — thin per-handoff tracking record.
--
-- One row per (driver_id, carrier_job_id). Captures the stage of an
-- Anderson-style partner application handoff from "apply initiated"
-- through "submitted to Sterling QuickBase" (or the failure /
-- queue-for-retry sibling states).
--
-- Holds NO FCRA-regulated data — no SSN, DOB, license, criminal,
-- drug/alcohol, MVR, or background-check info. The thin record is
-- intentional: it's an operational state machine for the handoff,
-- not a mirror of the carrier's internal tracking system. Pattern
-- matches the Swift §A5 record per spec.
--
-- Spec source: docs/SPEC_anderson-application-handoff-addendum-v2.md
-- §B7 ("CDLA.jobs's tracking record"). §B6.3 enumerates the failure
-- semantics that drive the stage transitions.

CREATE TABLE "partner_application_stages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  "driver_id" uuid NOT NULL
    REFERENCES "drivers"("id") ON DELETE CASCADE,
  "carrier_job_id" uuid NOT NULL
    REFERENCES "carrier_jobs"("id") ON DELETE CASCADE,
  "carrier_id" uuid NOT NULL
    REFERENCES "carriers"("id") ON DELETE CASCADE,

  -- Stage machine — values are owned by the application code in
  -- src/app/match/[driverId]/[jobId]/apply/actions.ts and
  -- src/lib/quickbase/client.ts. Enumerated here via CHECK
  -- (rather than an enum type) so adding a new state in a future
  -- spec doesn't require a follow-up migration to extend the enum.
  "stage" text NOT NULL,

  -- QuickBase push state. Populated only for handoffs where the
  -- carrier's partner_handoff_config.handoff_type is
  -- 'anderson_quickbase' (or another future QB-flavored handoff).
  -- All four fields stay NULL for non-QB handoff types.
  "quickbase_record_id" text,
  "quickbase_push_attempted_at" timestamptz,
  "quickbase_push_succeeded_at" timestamptz,
  "quickbase_push_attempts" integer NOT NULL DEFAULT 0,
  "quickbase_last_error" text,

  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT "partner_application_stages_stage_chk"
    CHECK ("stage" IN (
      'apply_initiated',
      'stage2_consented',
      'intelliapp_link_sent',
      'submitted_to_sterling',
      'submit_failed_validation',
      'submit_queued_for_retry',
      'stalled'
    ))
);

-- One row per (driver, job). Re-applying to the same job updates
-- this row in place rather than creating a duplicate handoff.
CREATE UNIQUE INDEX "partner_application_stages_driver_job_uniq"
  ON "partner_application_stages" ("driver_id", "carrier_job_id");

CREATE INDEX "partner_application_stages_driver_idx"
  ON "partner_application_stages" ("driver_id");

CREATE INDEX "partner_application_stages_carrier_idx"
  ON "partner_application_stages" ("carrier_id");

CREATE INDEX "partner_application_stages_stage_idx"
  ON "partner_application_stages" ("stage");
