-- Accept fractional years of experience so drivers with as little as a few
-- months can complete intake (carriers in our pool will hire from 3 months).
-- The matching engine already converts years_held × 12 to months; switching
-- to numeric(5,2) gives us 0.25 (= 3 months) without other changes.

ALTER TABLE "drivers"
        ALTER COLUMN "years_held" TYPE numeric(5, 2)
        USING "years_held"::numeric(5, 2);--> statement-breakpoint

ALTER TABLE "drivers"
        ALTER COLUMN "otr_years" TYPE numeric(5, 2)
        USING "otr_years"::numeric(5, 2);--> statement-breakpoint

ALTER TABLE "drivers"
        ALTER COLUMN "otr_years" SET DEFAULT 0;
