-- Matching engine v2: geospatial migration.
-- Drops the v1 carrier_hiring_rules + old tables and rebuilds carriers,
-- carrier_jobs, drivers, zip_codes per Carrier Jobs Database Schema v2 +
-- Matching Engine Field Schema v2.1. No production data; safe to recreate.

DROP TABLE IF EXISTS "carrier_hiring_rules" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "drivers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "carriers" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "zip_codes" CASCADE;--> statement-breakpoint

DROP TYPE IF EXISTS "public"."carrier_kind";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."carrier_tier";--> statement-breakpoint

CREATE TYPE "public"."carrier_kind" AS ENUM('partner', 'prospect', 'subscription');--> statement-breakpoint
CREATE TYPE "public"."carrier_tier" AS ENUM('tier_1', 'tier_2', 'none');--> statement-breakpoint
CREATE TYPE "public"."carrier_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."tier_1_billing_status" AS ENUM('current', 'past_due', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sap_tolerance" AS ENUM('accepts_none', 'accepts_completed_only', 'accepts_all');--> statement-breakpoint
CREATE TYPE "public"."application_surface" AS ENUM('tenstreet_intelliapp', 'custom_intake_form', 'email_only', 'phone_only', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."data_source" AS ENUM('manual_partner_intake', 'manual_subscription_onboarding', 'fmcsa_census_scrape', 'tenstreet_feed', 'carrier_self_service', 'llm_extract_from_posting');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('verified', 'stale', 'unverified');--> statement-breakpoint
CREATE TYPE "public"."data_quality" AS ENUM('complete', 'partial', 'minimal');--> statement-breakpoint

CREATE TABLE "carriers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "name" text NOT NULL,
        "legal_name" text,
        "kind" "carrier_kind" DEFAULT 'prospect' NOT NULL,
        "tier" "carrier_tier" DEFAULT 'none' NOT NULL,
        "status" "carrier_status" DEFAULT 'active' NOT NULL,
        "primary_contact_name" text,
        "primary_contact_email" text,
        "primary_contact_phone" text,
        "public_careers_url" text,
        "tenstreet_account_id" text,
        "fmcsa_mc_number" text,
        "fmcsa_dot_number" text,
        "business_address_lat" numeric(9, 6),
        "business_address_lng" numeric(9, 6),
        "tier_1_started_at" timestamp with time zone,
        "tier_1_renewed_at" timestamp with time zone,
        "tier_1_billing_status" "tier_1_billing_status",
        "phtp_referral_agreement_active" boolean DEFAULT false NOT NULL,
        "phtp_referral_agreement_signed_at" timestamp with time zone,
        "phtp_per_hire_bounty_usd" integer,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "carrier_jobs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "carrier_id" uuid NOT NULL,
        "status" "carrier_status" DEFAULT 'active' NOT NULL,
        "position_title" text NOT NULL,
        "description" text,
        "domicile_city" text NOT NULL,
        "domicile_state" varchar(2) NOT NULL,
        "domicile_zip" varchar(5),
        "domicile_lat" numeric(9, 6) NOT NULL,
        "domicile_lng" numeric(9, 6) NOT NULL,
        "hiring_radius_miles" integer,
        "equipment" text NOT NULL,
        "min_experience_months" integer DEFAULT 0 NOT NULL,
        "min_otr_experience_months" integer,
        "accepted_cdl_states" text[] DEFAULT '{}' NOT NULL,
        "required_endorsements" text[] DEFAULT '{}' NOT NULL,
        "accepted_home_time_types" home_time[] DEFAULT ARRAY[]::home_time[] NOT NULL,
        "pay_range_max_weekly_usd" integer,
        "accepts_terminated" boolean DEFAULT false NOT NULL,
        "accepts_failed_dot_test" boolean DEFAULT false NOT NULL,
        "sap_tolerance" "sap_tolerance" DEFAULT 'accepts_none' NOT NULL,
        "max_tickets_3yr" integer,
        "max_accidents_3yr" integer,
        "max_at_fault_accidents_3yr" integer,
        "accepts_dui" boolean DEFAULT false NOT NULL,
        "dui_max_recency_months" integer,
        "accepts_felony" boolean DEFAULT false NOT NULL,
        "preferred_equipment_experience" text[] DEFAULT '{}' NOT NULL,
        "preferred_regions" text[] DEFAULT '{}' NOT NULL,
        "application_surface" "application_surface" DEFAULT 'unknown' NOT NULL,
        "application_url" text,
        "application_email" text,
        "application_phone" text,
        "application_form_schema" jsonb,
        "last_application_surface_verified_at" timestamp with time zone,
        "data_source" "data_source" DEFAULT 'manual_partner_intake' NOT NULL,
        "source_url" text,
        "last_verified_at" timestamp with time zone,
        "verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
        "data_quality" "data_quality" DEFAULT 'partial' NOT NULL,
        "display_pay_range_min_weekly_usd" integer,
        "display_pay_range_max_weekly_usd" integer,
        "display_signing_bonus_usd" integer,
        "display_home_time_description" text,
        "display_lane_description" text,
        "display_benefits_summary" text,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL,
        "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT "carrier_jobs_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE cascade ON UPDATE no action
);--> statement-breakpoint

CREATE TABLE "drivers" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
        "first_name" text NOT NULL,
        "last_name" text NOT NULL,
        "email" text NOT NULL,
        "phone" text NOT NULL,
        "home_zip" varchar(5),
        "home_lat" numeric(9, 6),
        "home_lng" numeric(9, 6),
        "willing_to_relocate" boolean DEFAULT false NOT NULL,
        "cdl_state" varchar(2) NOT NULL,
        "years_held" integer NOT NULL,
        "otr_years" integer DEFAULT 0 NOT NULL,
        "equipment_run" text[] NOT NULL,
        "endorsements" text[] DEFAULT '{}' NOT NULL,
        "desired_equipment" text[] NOT NULL,
        "desired_regions" text[] NOT NULL,
        "home_time" "home_time" NOT NULL,
        "min_weekly_pay" integer DEFAULT 0 NOT NULL,
        "terminated_from_any_of_last_3_employers" boolean NOT NULL,
        "failed_dot_test" boolean NOT NULL,
        "sap_status" "sap_status" DEFAULT 'not-in-sap' NOT NULL,
        "tickets_3yr_count" integer,
        "accidents_3yr_count" integer,
        "accidents_3yr_at_fault_count" integer,
        "dui_ever" boolean,
        "dui_most_recent_date" date,
        "felony_ever" boolean,
        "accidents_details" text DEFAULT '' NOT NULL,
        "felony_details" text DEFAULT '' NOT NULL,
        "attest_accurate" boolean NOT NULL,
        "consent_to_share" boolean NOT NULL,
        "sms_opt_in" boolean DEFAULT false NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE TABLE "zip_codes" (
        "zip" varchar(5) PRIMARY KEY NOT NULL,
        "city" text NOT NULL,
        "state" varchar(2) NOT NULL,
        "lat" numeric(9, 6) NOT NULL,
        "lng" numeric(9, 6) NOT NULL
);--> statement-breakpoint

CREATE INDEX "carrier_jobs_carrier_idx" ON "carrier_jobs" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "carrier_jobs_status_idx" ON "carrier_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "carrier_jobs_equipment_idx" ON "carrier_jobs" USING btree ("equipment");--> statement-breakpoint
CREATE INDEX "carrier_jobs_domicile_lat_lng_idx" ON "carrier_jobs" USING btree ("domicile_lat","domicile_lng");--> statement-breakpoint
CREATE INDEX "drivers_cdl_state_idx" ON "drivers" USING btree ("cdl_state");--> statement-breakpoint
CREATE INDEX "drivers_email_idx" ON "drivers" USING btree ("email");--> statement-breakpoint
CREATE INDEX "drivers_home_zip_idx" ON "drivers" USING btree ("home_zip");--> statement-breakpoint
CREATE INDEX "zip_codes_state_idx" ON "zip_codes" USING btree ("state");
