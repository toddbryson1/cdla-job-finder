CREATE TYPE "public"."carrier_kind" AS ENUM('partner', 'prospect');--> statement-breakpoint
CREATE TYPE "public"."carrier_tier" AS ENUM('tier_1', 'tier_2');--> statement-breakpoint
CREATE TYPE "public"."home_time" AS ENUM('daily', 'weekly', 'biweekly', 'otr');--> statement-breakpoint
CREATE TYPE "public"."sap_status" AS ENUM('not-in-sap', 'in-sap', 'completed-sap');--> statement-breakpoint
CREATE TABLE "carrier_hiring_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"carrier_id" integer NOT NULL,
	"region" text NOT NULL,
	"equipment" text NOT NULL,
	"pay_min_weekly" integer,
	"pay_max_weekly" integer,
	"home_time" "home_time",
	"min_years_exp" integer DEFAULT 0 NOT NULL,
	"allows_accidents" boolean DEFAULT true NOT NULL,
	"allows_dui" boolean DEFAULT false NOT NULL,
	"allows_felony" boolean DEFAULT false NOT NULL,
	"allows_termination" boolean DEFAULT true NOT NULL,
	"allows_failed_dot_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "carriers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" "carrier_kind" DEFAULT 'prospect' NOT NULL,
	"tier" "carrier_tier" DEFAULT 'tier_2' NOT NULL,
	"tenstreet_id" text,
	"contact_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drivers" (
	"id" serial PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"cdl_state" varchar(2) NOT NULL,
	"years_held" integer NOT NULL,
	"equipment_run" text[] NOT NULL,
	"endorsements" text[] DEFAULT '{}' NOT NULL,
	"otr_years" integer DEFAULT 0 NOT NULL,
	"desired_equipment" text[] NOT NULL,
	"desired_regions" text[] NOT NULL,
	"home_time" "home_time" NOT NULL,
	"min_weekly_pay" integer DEFAULT 0 NOT NULL,
	"open_to_relocation" boolean DEFAULT false NOT NULL,
	"accidents_last_3_years" integer NOT NULL,
	"accidents_details" text DEFAULT '' NOT NULL,
	"violations_last_3_years" integer NOT NULL,
	"dui_ever" boolean NOT NULL,
	"dui_most_recent_date" text DEFAULT '' NOT NULL,
	"felony_ever" boolean NOT NULL,
	"felony_details" text DEFAULT '' NOT NULL,
	"terminated_from_any_of_last_3_employers" boolean NOT NULL,
	"failed_dot_test" boolean NOT NULL,
	"sap_status" "sap_status" DEFAULT 'not-in-sap' NOT NULL,
	"attest_accurate" boolean NOT NULL,
	"consent_to_share" boolean NOT NULL,
	"sms_opt_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carrier_hiring_rules" ADD CONSTRAINT "carrier_hiring_rules_carrier_id_carriers_id_fk" FOREIGN KEY ("carrier_id") REFERENCES "public"."carriers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "carrier_hiring_rules_region_equipment_idx" ON "carrier_hiring_rules" USING btree ("region","equipment");--> statement-breakpoint
CREATE INDEX "carrier_hiring_rules_carrier_idx" ON "carrier_hiring_rules" USING btree ("carrier_id");--> statement-breakpoint
CREATE INDEX "drivers_cdl_state_idx" ON "drivers" USING btree ("cdl_state");--> statement-breakpoint
CREATE INDEX "drivers_email_idx" ON "drivers" USING btree ("email");