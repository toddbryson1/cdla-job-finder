import {
  pgTable,
  serial,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const carrierKindEnum = pgEnum("carrier_kind", ["partner", "prospect"]);
export const carrierTierEnum = pgEnum("carrier_tier", ["tier_1", "tier_2"]);
export const homeTimeEnum = pgEnum("home_time", ["daily", "weekly", "biweekly", "otr"]);
export const sapStatusEnum = pgEnum("sap_status", [
  "not-in-sap",
  "in-sap",
  "completed-sap",
]);

export const carriers = pgTable("carriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  kind: carrierKindEnum("kind").notNull().default("prospect"),
  tier: carrierTierEnum("tier").notNull().default("tier_2"),
  tenstreetId: text("tenstreet_id"),
  contactEmail: text("contact_email"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const carrierHiringRules = pgTable(
  "carrier_hiring_rules",
  {
    id: serial("id").primaryKey(),
    carrierId: integer("carrier_id")
      .references(() => carriers.id, { onDelete: "cascade" })
      .notNull(),
    region: text("region").notNull(),
    equipment: text("equipment").notNull(),
    payMinWeekly: integer("pay_min_weekly"),
    payMaxWeekly: integer("pay_max_weekly"),
    homeTime: homeTimeEnum("home_time"),
    minYearsExp: integer("min_years_exp").default(0).notNull(),
    allowsAccidents: boolean("allows_accidents").default(true).notNull(),
    allowsDui: boolean("allows_dui").default(false).notNull(),
    allowsFelony: boolean("allows_felony").default(false).notNull(),
    allowsTermination: boolean("allows_termination").default(true).notNull(),
    allowsFailedDotTest: boolean("allows_failed_dot_test").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("carrier_hiring_rules_region_equipment_idx").on(t.region, t.equipment),
    index("carrier_hiring_rules_carrier_idx").on(t.carrierId),
  ],
);

export const drivers = pgTable(
  "drivers",
  {
    id: serial("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    cdlState: varchar("cdl_state", { length: 2 }).notNull(),
    yearsHeld: integer("years_held").notNull(),
    equipmentRun: text("equipment_run").array().notNull(),
    endorsements: text("endorsements").array().notNull().default([]),
    otrYears: integer("otr_years").default(0).notNull(),
    desiredEquipment: text("desired_equipment").array().notNull(),
    desiredRegions: text("desired_regions").array().notNull(),
    homeTime: homeTimeEnum("home_time").notNull(),
    minWeeklyPay: integer("min_weekly_pay").default(0).notNull(),
    openToRelocation: boolean("open_to_relocation").default(false).notNull(),
    accidentsLast3Years: integer("accidents_last_3_years").notNull(),
    accidentsDetails: text("accidents_details").default("").notNull(),
    violationsLast3Years: integer("violations_last_3_years").notNull(),
    duiEver: boolean("dui_ever").notNull(),
    duiMostRecentDate: text("dui_most_recent_date").default("").notNull(),
    felonyEver: boolean("felony_ever").notNull(),
    felonyDetails: text("felony_details").default("").notNull(),
    terminatedFromAnyOfLast3Employers: boolean(
      "terminated_from_any_of_last_3_employers",
    ).notNull(),
    failedDotTest: boolean("failed_dot_test").notNull(),
    sapStatus: sapStatusEnum("sap_status").default("not-in-sap").notNull(),
    attestAccurate: boolean("attest_accurate").notNull(),
    consentToShare: boolean("consent_to_share").notNull(),
    smsOptIn: boolean("sms_opt_in").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("drivers_cdl_state_idx").on(t.cdlState),
    index("drivers_email_idx").on(t.email),
  ],
);
