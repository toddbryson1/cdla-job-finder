-- Add 'transport_america' to the data_source enum.
-- Per spec §11 Q8 — TA Dedicated jobs need their own data_source value
-- (vs. piggybacking on tenstreet_feed which means "from a Tenstreet
-- ATS feed"). TA Dedicated comes from DLM's Google Sheets, not from
-- a Tenstreet feed.

ALTER TYPE "data_source" ADD VALUE IF NOT EXISTS 'transport_america';
