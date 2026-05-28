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
  uniqueIndex,
  check,
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

    // External source identifier (Smartsheet row id, Tenstreet job id, etc.)
    // Used to upsert on re-sync from third-party feeds. Partial unique
    // index — NULL is allowed (existing seed rows have no external source).
    externalSourceId: text("external_source_id"),

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
    uniqueIndex("carrier_jobs_external_source_uniq")
      .on(t.externalSourceId)
      .where(sql`${t.externalSourceId} IS NOT NULL`),
    // OTR invariant — paired with @/lib/matching/hardFilter.ts.
    //
    // hiring_radius_miles = NULL means "this job hires nationwide / OTR".
    // The matcher enforces that only drivers with 'otr' in their
    // home_time array match such jobs. For that contract to hold, the
    // job itself must list 'otr' as an accepted home time — otherwise
    // it's a misconfig (typically: an OTR lane mistakenly tagged with
    // a weekly home-time text in the source feed).
    //
    // This CHECK catches the bad row at INSERT/UPDATE time so no
    // future data source (Swift sync, manual entry, future Tenstreet
    // feed) can ship the corrupt state that caused the production
    // OTR-leakage bug we fixed in commit ca73e85.
    check(
      "carrier_jobs_otr_invariant",
      sql`${t.hiringRadiusMiles} IS NOT NULL OR 'otr' = ANY(${t.acceptedHomeTimeTypes})`,
    ),
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

// Records each reverse-match alert send per driver. Drives:
//   - "new matches since last alert" detection (matched_at > most recent
//     sent_at for that driver)
//   - the weekly cap (max 3 alerts per driver per rolling 7-day window)
// /api/cron/reverse-matches reads and writes this table.
export const driverReverseMatchAlerts = pgTable(
  "driver_reverse_match_alerts",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    newMatchCount: integer("new_match_count").notNull(),
    status: text("status").notNull().default("sent"),
    skipReason: text("skip_reason"),
    ghlMessageId: text("ghl_message_id"),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("driver_reverse_match_alerts_driver_sent_idx").on(
      t.driverId,
      t.sentAt,
    ),
  ],
);

// Scheduled-send rows for the 6-email driver nurture sequence. One row
// per (driver, email_index 1..6), inserted at intake time with
// scheduled_for = intake_date + (30 * email_index) days. The daily
// /api/cron/nurture endpoint picks up rows where scheduled_for <= now()
// AND status='pending', sends via GHL, flips status to sent/skipped/failed.
export const driverNurtureSends = pgTable(
  "driver_nurture_sends",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    driverId: uuid("driver_id")
      .references(() => drivers.id, { onDelete: "cascade" })
      .notNull(),
    emailIndex: integer("email_index").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    status: text("status").notNull().default("pending"),
    skipReason: text("skip_reason"),
    ghlMessageId: text("ghl_message_id"),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("driver_nurture_sends_status_scheduled_idx").on(
      t.status,
      t.scheduledFor,
    ),
    index("driver_nurture_sends_driver_idx").on(t.driverId),
  ],
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

// One row per "posting cycle" for a (carrier_job, city) pair. Each cycle
// is a 20-day public-facing instance of the job at a specific city. The
// /job/[slug] URL is keyed by THIS row's id (not the carrier_job id) so
// the same underlying job can have multiple simultaneous URLs in
// different cities, and a fresh URL after each repost.
//
// Lifecycle (driven by /api/cron/daily → spawnPostingCycles):
//   1. New active carrier_job → spawn one cycle in domicile_city
//   2. cycle.expires_at = posted_at + 20 days
//   3. When the cycle expires, mark it expired (URL goes 404, sitemap drops it)
//   4. 3 days after expiration, IF carrier_job is still active, spawn a
//      new cycle. New cycle picks a city from the candidate pool that
//      hasn't been the primary recently — biases for SEO reach across
//      the metro.
//   5. Cities chosen via @/lib/posting-cities (zip_codes geo query,
//      ≥50 mile spacing).
//
// At any given time a carrier_job can have multiple active cycles in
// different cities (≥50 mi apart) plus historical expired cycles for
// audit. The "primary" cycle is the most recent active one; secondary
// cycles in other cities run concurrently to broaden SERP coverage.
export const jobPostingCycleStatusEnum = pgEnum("job_posting_cycle_status", [
  "active",
  "expired",
]);

export const jobPostingCycles = pgTable(
  "job_posting_cycles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jobId: uuid("job_id")
      .references(() => carrierJobs.id, { onDelete: "cascade" })
      .notNull(),
    city: text("city").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    zip: varchar("zip", { length: 5 }),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    cycleIndex: integer("cycle_index").notNull(), // 1, 2, 3... per (job, city)
    variantIndex: integer("variant_index").notNull().default(0), // picks the description template
    isPrimary: boolean("is_primary").notNull().default(false),
    postedAt: timestamp("posted_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: jobPostingCycleStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("job_posting_cycles_status_expires_idx").on(t.status, t.expiresAt),
    index("job_posting_cycles_job_idx").on(t.jobId),
    index("job_posting_cycles_job_status_idx").on(t.jobId, t.status),
    // At most one ACTIVE cycle per (job, city) at any time. Expired
    // cycles accumulate (audit log + city-rotation memory).
    uniqueIndex("job_posting_cycles_active_uniq")
      .on(t.jobId, t.city, t.state)
      .where(sql`${t.status} = 'active'`),
  ],
);

// ────────────────────────────────────────────────────────────────────────
// Content machine — see CONTENT_MACHINE_README.md and docs/CDLAjobs_Daily_Article_Prompt.md
//
// Once per day the master cron (/api/cron/daily) selects 1–4 (bucket,
// topic, region) triples, calls the Anthropic API for each, parses the
// structured output into `articles`, runs validation, publishes to
// /articles/[slug], pings IndexNow, and emails the owner a report.
// Topic rotation uses oldest last_used_at within a bucket; region
// rotation uses oldest last_used_at across regions. Bucket coverage when
// count<4 is sequenced via daily_run_state.
// ────────────────────────────────────────────────────────────────────────

// Seed list of candidate topics, one row per (bucket, topic). The
// machine picks per bucket: oldest active last_used_at wins. Topics
// flagged requires_data are de-prioritized when no verified figures are
// available for the target region (see Section 6 of the article prompt).
export const articleTopics = pgTable(
  "article_topics",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    bucket: integer("bucket").notNull(), // 1..4
    topic: text("topic").notNull(),
    regionScoped: boolean("region_scoped").notNull().default(false),
    requiresData: boolean("requires_data").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("article_topics_bucket_active_last_used_idx").on(
      t.bucket,
      t.active,
      t.lastUsedAt,
    ),
    check("article_topics_bucket_range", sql`${t.bucket} BETWEEN 1 AND 4`),
  ],
);

// The same region applies to all buckets generated on a given day (for
// thematic coherence in the daily report and site clustering). Selection
// is oldest active last_used_at. Bucket 4 may ignore the region in its
// prompt (greed-machine articles are largely region-independent).
export const articleRegions = pgTable(
  "article_regions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    city: text("city").notNull(),
    state: varchar("state", { length: 2 }).notNull(),
    active: boolean("active").notNull().default(true),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("article_regions_active_last_used_idx").on(t.active, t.lastUsedAt),
  ],
);

// One row per generated article. status transitions:
//   generated → published   (happy path)
//   generated → failed      (validation failed)
//   generated → skipped     (placeholder rewrite failed after 1 retry)
// Slug is unique against itself; collisions with existing site routes
// are detected at publish time and a short suffix is appended (logged).
export const articles = pgTable(
  "articles",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    bucket: integer("bucket").notNull(),
    topic: text("topic").notNull(),
    region: text("region"), // "City, ST" or null for national
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    primaryKeyword: text("primary_keyword").notNull(),
    secondaryKeywords: text("secondary_keywords").array().notNull().default([]),
    titleTag: text("title_tag").notNull(),
    metaDescription: text("meta_description").notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    honestCaveat: text("honest_caveat").notNull().default(""),
    internalLinksJson: jsonb("internal_links_json"),
    ctaBlock: text("cta_block").notNull().default(""),
    faqJson: jsonb("faq_json"),
    faqSchemaJsonld: text("faq_schema_jsonld").notNull().default(""),
    reviewFlags: text("review_flags").notNull().default(""),
    wordCount: integer("word_count").notNull().default(0),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    publishedUrl: text("published_url"),
    llmModel: text("llm_model").notNull(),
    // 'generated' | 'published' | 'failed' | 'skipped'
    status: text("status").notNull().default("generated"),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("articles_slug_uniq").on(t.slug),
    index("articles_status_idx").on(t.status),
    index("articles_published_at_idx").on(t.publishedAt),
    index("articles_bucket_idx").on(t.bucket),
    check("articles_bucket_range", sql`${t.bucket} BETWEEN 1 AND 4`),
  ],
);

// Dormant — populated only when GSC_INTEGRATION_ENABLED=true. One row per
// (article, daysSincePublish in {1,3,7}). The daily cron picks up rows
// where check_at <= now() AND checked_at IS NULL, hits the GSC URL
// Inspection API, writes coverage_state + raw_response back.
export const articleIndexStatus = pgTable(
  "article_index_status",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    articleId: uuid("article_id")
      .references(() => articles.id, { onDelete: "cascade" })
      .notNull(),
    daysSincePublish: integer("days_since_publish").notNull(), // 1, 3, or 7
    checkAt: timestamp("check_at", { withTimezone: true }).notNull(),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    coverageState: text("coverage_state"),
    rawResponse: jsonb("raw_response"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("article_index_status_pending_idx").on(t.checkedAt, t.checkAt),
    index("article_index_status_article_idx").on(t.articleId),
  ],
);

// Singleton-ish state for the bucket-skip sequencer when daily count<4.
// `lastBucketCursor` is an integer 1..4 indicating where the last run
// ended in the rotation; the next run continues from there. See
// src/lib/content-machine/select.ts for the exact semantics.
export const contentMachineState = pgTable("content_machine_state", {
  id: integer("id").primaryKey().default(1), // singleton row
  lastRunDate: date("last_run_date"),
  lastBucketCursor: integer("last_bucket_cursor").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// One row per daily run for observability and the email report.
export const contentMachineRuns = pgTable(
  "content_machine_runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // 'success' | 'partial' | 'failed' | 'disabled'
    status: text("status").notNull().default("success"),
    requestedCount: integer("requested_count").notNull().default(0),
    publishedCount: integer("published_count").notNull().default(0),
    failedCount: integer("failed_count").notNull().default(0),
    skippedCount: integer("skipped_count").notNull().default(0),
    errorMessage: text("error_message"),
  },
  (t) => [index("content_machine_runs_date_idx").on(t.runDate)],
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
