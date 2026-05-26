import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  uuid,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const carrierKindEnum = pgEnum("carrier_kind", [
  "partner",
  "prospect",
  "subscription",
]);
export const carrierTierEnum = pgEnum("carrier_tier", ["tier_1", "tier_2", "none"]);
export const carrierStatusEnum = pgEnum("carrier_status", [
  "active",
  "paused",
  "archived",
]);
export const tier1BillingStatusEnum = pgEnum("tier_1_billing_status", [
  "current",
  "past_due",
  "cancelled",
]);
export const homeTimeEnum = pgEnum("home_time", [
  "daily",
  "weekly",
  "biweekly",
  "otr",
]);
export const sapStatusEnum = pgEnum("sap_status", [
  "not-in-sap",
  "in-sap",
  "completed-sap",
]);
export const sapToleranceEnum = pgEnum("sap_tolerance", [
  "accepts_none",
  "accepts_completed_only",
  "accepts_all",
]);
export const applicationSurfaceEnum = pgEnum("application_surface", [
  "tenstreet_intelliapp",
  "custom_intake_form",
  "email_only",
  "phone_only",
  "unknown",
]);
export const dataSourceEnum = pgEnum("data_source", [
  "manual_partner_intake",
  "manual_subscription_onboarding",
  "fmcsa_census_scrape",
  "tenstreet_feed",
  "carrier_self_service",
  "llm_extract_from_posting",
]);
export const verificationStatusEnum = pgEnum("verification_status", [
  "verified",
  "stale",
  "unverified",
]);
export const dataQualityEnum = pgEnum("data_quality", [
  "complete",
  "partial",
  "minimal",
]);

export const carriers = pgTable("carriers", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  legalName: text("legal_name"),
  kind: carrierKindEnum("kind").notNull().default("prospect"),
  tier: carrierTierEnum("tier").notNull().default("none"),
  status: carrierStatusEnum("status").notNull().default("active"),

  primaryContactName: text("primary_contact_name"),
  primaryContactEmail: text("primary_contact_email"),
  primaryContactPhone: text("primary_contact_phone"),
  publicCareersUrl: text("public_careers_url"),
  tenstreetAccountId: text("tenstreet_account_id"),
  fmcsaMcNumber: text("fmcsa_mc_number"),
  fmcsaDotNumber: text("fmcsa_dot_number"),
  businessAddressLat: numeric("business_address_lat", { precision: 9, scale: 6 }),
  businessAddressLng: numeric("business_address_lng", { precision: 9, scale: 6 }),

  tier1StartedAt: timestamp("tier_1_started_at", { withTimezone: true }),
  tier1RenewedAt: timestamp("tier_1_renewed_at", { withTimezone: true }),
  tier1BillingStatus: tier1BillingStatusEnum("tier_1_billing_status"),

  phtpReferralAgreementActive: boolean("phtp_referral_agreement_active")
    .notNull()
    .default(false),
  phtpReferralAgreementSignedAt: timestamp("phtp_referral_agreement_signed_at", {
    withTimezone: true,
  }),
  phtpPerHireBountyUsd: integer("phtp_per_hire_bounty_usd"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const carrierJobs = pgTable(
  "carrier_jobs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    carrierId: uuid("carrier_id")
      .references(() => carriers.id, { onDelete: "cascade" })
      .notNull(),
    status: carrierStatusEnum("status").notNull().default("active"),
    positionTitle: text("position_title").notNull(),
    description: text("description"),

    // Geospatial
    domicileCity: text("domicile_city").notNull(),
    domicileState: varchar("domicile_state", { length: 2 }).notNull(),
    domicileZip: varchar("domicile_zip", { length: 5 }),
    domicileLat: numeric("domicile_lat", { precision: 9, scale: 6 }).notNull(),
    domicileLng: numeric("domicile_lng", { precision: 9, scale: 6 }).notNull(),
    hiringRadiusMiles: integer("hiring_radius_miles"),

    // Equipment
    equipment: text("equipment").notNull(),

    // Hard-filter rule fields
    minExperienceMonths: integer("min_experience_months").notNull().default(0),
    minOtrExperienceMonths: integer("min_otr_experience_months"),
    acceptedCdlStates: text("accepted_cdl_states").array().notNull().default([]),
    requiredEndorsements: text("required_endorsements").array().notNull().default([]),
    acceptedHomeTimeTypes: homeTimeEnum("accepted_home_time_types")
      .array()
      .notNull()
      .default(sql`ARRAY[]::home_time[]`),
    payRangeMaxWeeklyUsd: integer("pay_range_max_weekly_usd"),
    acceptsTerminated: boolean("accepts_terminated").notNull().default(false),
    acceptsFailedDotTest: boolean("accepts_failed_dot_test").notNull().default(false),
    sapTolerance: sapToleranceEnum("sap_tolerance").notNull().default("accepts_none"),

    // Stage 2 rule fields
    maxTickets3yr: integer("max_tickets_3yr"),
    maxAccidents3yr: integer("max_accidents_3yr"),
    maxAtFaultAccidents3yr: integer("max_at_fault_accidents_3yr"),
    acceptsDui: boolean("accepts_dui").notNull().default(false),
    duiMaxRecencyMonths: integer("dui_max_recency_months"),
    acceptsFelony: boolean("accepts_felony").notNull().default(false),

    // Soft-rank
    preferredEquipmentExperience: text("preferred_equipment_experience")
      .array()
      .notNull()
      .default([]),
    preferredRegions: text("preferred_regions").array().notNull().default([]),

    // Application surface
    applicationSurface: applicationSurfaceEnum("application_surface")
      .notNull()
      .default("unknown"),
    applicationUrl: text("application_url"),
    applicationEmail: text("application_email"),
    applicationPhone: text("application_phone"),
    applicationFormSchema: jsonb("application_form_schema"),
    lastApplicationSurfaceVerifiedAt: timestamp(
      "last_application_surface_verified_at",
      { withTimezone: true },
    ),

    // Provenance
    dataSource: dataSourceEnum("data_source")
      .notNull()
      .default("manual_partner_intake"),
    sourceUrl: text("source_url"),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    verificationStatus: verificationStatusEnum("verification_status")
      .notNull()
      .default("unverified"),
    dataQuality: dataQualityEnum("data_quality").notNull().default("partial"),

    // Display fields
    displayPayRangeMinWeeklyUsd: integer("display_pay_range_min_weekly_usd"),
    displayPayRangeMaxWeeklyUsd: integer("display_pay_range_max_weekly_usd"),
    displaySigningBonusUsd: integer("display_signing_bonus_usd"),
    displayHomeTimeDescription: text("display_home_time_description"),
    displayLaneDescription: text("display_lane_description"),
    displayBenefitsSummary: text("display_benefits_summary"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("carrier_jobs_carrier_idx").on(t.carrierId),
    index("carrier_jobs_status_idx").on(t.status),
    index("carrier_jobs_equipment_idx").on(t.equipment),
    index("carrier_jobs_domicile_lat_lng_idx").on(t.domicileLat, t.domicileLng),
  ],
);

export const drivers = pgTable(
  "drivers",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone").notNull(),

    // Geographic
    homeZip: varchar("home_zip", { length: 5 }),
    homeLat: numeric("home_lat", { precision: 9, scale: 6 }),
    homeLng: numeric("home_lng", { precision: 9, scale: 6 }),
    willingToRelocate: boolean("willing_to_relocate").notNull().default(false),

    cdlState: varchar("cdl_state", { length: 2 }).notNull(),
    yearsHeld: numeric("years_held", { precision: 5, scale: 2 }).notNull(),
    otrYears: numeric("otr_years", { precision: 5, scale: 2 })
      .notNull()
      .default("0"),

    equipmentRun: text("equipment_run").array().notNull(),
    endorsements: text("endorsements").array().notNull().default([]),
    desiredEquipment: text("desired_equipment").array().notNull(),
    desiredRegions: text("desired_regions").array().notNull(),

    homeTime: homeTimeEnum("home_time")
      .array()
      .notNull()
      .default(sql`ARRAY[]::home_time[]`),
    minWeeklyPay: integer("min_weekly_pay").notNull().default(0),

    // Stage 1 safety
    terminatedFromAnyOfLast3Employers: boolean(
      "terminated_from_any_of_last_3_employers",
    ).notNull(),
    failedDotTest: boolean("failed_dot_test").notNull(),
    sapStatus: sapStatusEnum("sap_status").notNull().default("not-in-sap"),

    // Stage 2 fields (all nullable; collected later)
    // TODO: migrate to per-carrier application records table
    tickets3yrCount: integer("tickets_3yr_count"),
    accidents3yrCount: integer("accidents_3yr_count"),
    accidents3yrAtFaultCount: integer("accidents_3yr_at_fault_count"),
    duiEver: boolean("dui_ever"),
    duiMostRecentDate: date("dui_most_recent_date"),
    felonyEver: boolean("felony_ever"),

    // Stage 2 per-carrier consent (most recent carrier; one row per driver in v1)
    stage2ConsentCarrierId: uuid("stage_2_consent_carrier_id").references(
      () => carriers.id,
      { onDelete: "set null" },
    ),
    stage2ConsentAt: timestamp("stage_2_consent_at", { withTimezone: true }),
    stage2ConsentTextVersion: text("stage_2_consent_text_version"),
    stage2TcpaOptIn: boolean("stage_2_tcpa_opt_in").default(false),

    // Free-text notes (kept for human review; not used by engine)
    accidentsDetails: text("accidents_details").notNull().default(""),
    felonyDetails: text("felony_details").notNull().default(""),
    terminationDetails: text("termination_details").notNull().default(""),

    // Consents
    attestAccurate: boolean("attest_accurate").notNull(),
    consentToShare: boolean("consent_to_share").notNull(),
    smsOptIn: boolean("sms_opt_in").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("drivers_cdl_state_idx").on(t.cdlState),
    index("drivers_email_idx").on(t.email),
    index("drivers_home_zip_idx").on(t.homeZip),
  ],
);

export const zipCodes = pgTable(
  "zip_codes",
  {
    zip: varchar("zip", { length: 5 }).primaryKey(),
    city: text("city").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    lat: numeric("lat", { precision: 9, scale: 6 }).notNull(),
    lng: numeric("lng", { precision: 9, scale: 6 }).notNull(),
  },
  (t) => [index("zip_codes_state_idx").on(t.state)],
);

// Tracks every (driver, job) Stage 2 pursuit. Created/updated when the
// driver consents on /match/[driverId]/[jobId]/apply. Drives the
// "you pursued this" badge on the matches list and any future
// per-application analytics. Replaces the single-most-recent fields on
// drivers (stage_2_consent_carrier_id etc.) for history purposes — those
// fields stay for quick latest-consent reads.
export const driverCarrierApplications = pgTable(
  "driver_carrier_applications",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    jobId: uuid("job_id")
      .references(() => carrierJobs.id, { onDelete: "cascade" })
      .notNull(),
    carrierId: uuid("carrier_id")
      .references(() => carriers.id, { onDelete: "cascade" })
      .notNull(),
    consentedAt: timestamp("consented_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    consentTextVersion: text("consent_text_version").notNull(),
    tcpaOptIn: boolean("tcpa_opt_in").notNull().default(false),
    lastQualified: boolean("last_qualified"),
    lastQualifiedAt: timestamp("last_qualified_at", { withTimezone: true }),
    lastQualificationReasons: text("last_qualification_reasons").array(),
  },
  (t) => [
    index("driver_carrier_applications_driver_idx").on(
      t.driverId,
      t.consentedAt,
    ),
    index("driver_carrier_applications_carrier_idx").on(t.carrierId),
  ],
);

// Persistent record of (driver, job) matches. One row per pair; matched_at
// is when the driver first saw this match. Drives Tier 1 exclusivity
// (getFirstMatchTime) and aggregate landing-page stats.
export const driverCarrierMatches = pgTable(
  "driver_carrier_matches",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    jobId: uuid("job_id")
      .references(() => carrierJobs.id, { onDelete: "cascade" })
      .notNull(),
    carrierId: uuid("carrier_id")
      .references(() => carriers.id, { onDelete: "cascade" })
      .notNull(),
    matchedAt: timestamp("matched_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    softRankScore: numeric("soft_rank_score", { precision: 6, scale: 3 }),
    distanceMilesFromDriverHome: numeric("distance_miles_from_driver_home", {
      precision: 7,
      scale: 1,
    }),
  },
  (t) => [
    index("driver_carrier_matches_driver_matched_idx").on(
      t.driverId,
      t.matchedAt,
    ),
    index("driver_carrier_matches_driver_carrier_idx").on(
      t.driverId,
      t.carrierId,
      t.matchedAt,
    ),
    index("driver_carrier_matches_job_idx").on(t.jobId),
    index("driver_carrier_matches_matched_at_idx").on(t.matchedAt),
  ],
);
