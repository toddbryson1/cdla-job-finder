-- Free-text explanation a driver provides when they answer "yes" to having
-- been terminated by their last trucking company. Kept for human/recruiter
-- review only; matching engine still gates on the boolean.

ALTER TABLE "drivers"
        ADD COLUMN "termination_details" text NOT NULL DEFAULT '';
