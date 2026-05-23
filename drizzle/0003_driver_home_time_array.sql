-- Drivers pick multiple home-time preferences (daily + weekly, etc.).
-- Carriers already store accepted_home_time_types as an array; this brings
-- the driver side to the same shape so the matching engine can use array
-- overlap instead of single-value membership.

ALTER TABLE "drivers"
        ALTER COLUMN "home_time" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "drivers"
        ALTER COLUMN "home_time" TYPE home_time[]
        USING CASE
                WHEN "home_time" IS NULL THEN ARRAY[]::home_time[]
                ELSE ARRAY["home_time"]::home_time[]
        END;--> statement-breakpoint

ALTER TABLE "drivers"
        ALTER COLUMN "home_time" SET DEFAULT ARRAY[]::home_time[];--> statement-breakpoint

ALTER TABLE "drivers"
        ALTER COLUMN "home_time" SET NOT NULL;
