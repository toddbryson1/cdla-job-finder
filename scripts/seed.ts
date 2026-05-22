import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { carrierJobs, carriers } from "../src/db/schema";
import { importZipCodes } from "./import-zip-codes";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

type CarrierKind = "partner" | "prospect" | "subscription";
type CarrierTier = "tier_1" | "tier_2" | "none";
type HomeTime = "daily" | "weekly" | "biweekly" | "otr";
type SapTolerance = "accepts_none" | "accepts_completed_only" | "accepts_all";
type ApplicationSurface =
  | "tenstreet_intelliapp"
  | "custom_intake_form"
  | "email_only"
  | "phone_only"
  | "unknown";
type DataSource =
  | "manual_partner_intake"
  | "manual_subscription_onboarding"
  | "fmcsa_census_scrape"
  | "tenstreet_feed"
  | "carrier_self_service"
  | "llm_extract_from_posting";
type VerificationStatus = "verified" | "stale" | "unverified";
type DataQuality = "complete" | "partial" | "minimal";

interface JobSeed {
  positionTitle: string;
  domicileCity: string;
  domicileState: string;
  domicileZip?: string;
  domicileLat: string;
  domicileLng: string;
  hiringRadiusMiles: number | null;
  equipment: string;
  minExperienceMonths: number;
  minOtrExperienceMonths?: number | null;
  acceptedCdlStates?: string[];
  requiredEndorsements?: string[];
  acceptedHomeTimeTypes: HomeTime[];
  payRangeMaxWeeklyUsd?: number | null;
  displayPayMin?: number | null;
  displayPayMax?: number | null;
  acceptsTerminated?: boolean;
  acceptsFailedDotTest?: boolean;
  sapTolerance?: SapTolerance;
  preferredEquipmentExperience?: string[];
  preferredRegions?: string[];
  applicationSurface: ApplicationSurface;
  applicationUrl?: string | null;
  applicationEmail?: string | null;
  applicationPhone?: string | null;
  applicationFormSchema?: Record<string, unknown> | null;
  dataSource: DataSource;
  verificationStatus: VerificationStatus;
  dataQuality: DataQuality;
  lastVerifiedAt?: Date | null;
}

interface CarrierSeed {
  name: string;
  legalName: string;
  kind: CarrierKind;
  tier: CarrierTier;
  tier1BillingStatus?: "current" | "past_due" | "cancelled" | null;
  tier1StartedAt?: Date | null;
  phtpReferralAgreementActive?: boolean;
  businessAddressLat?: string | null;
  businessAddressLng?: string | null;
  jobs: JobSeed[];
}

const NOW = new Date();
const RECENT = new Date(NOW.getTime() - 24 * 60 * 60 * 1000); // 1 day ago

const EXAMPLE_FORM_SCHEMA = {
  form_url: "https://example-southeast-multi.com/apply",
  method: "POST",
  fields: {
    first_name: { selector: "input[name='fname']", source: "driver.first_name" },
    last_name: { selector: "input[name='lname']", source: "driver.last_name" },
    email: { selector: "input[name='email']", source: "driver.email" },
    phone: { selector: "input[name='phone']", source: "driver.phone", format: "phone_us" },
    experience_years: {
      selector: "select[name='exp']",
      source: "driver.years_held",
      format: "rounded_string",
    },
  },
  success_indicators: [
    { type: "url_contains", value: "/thank-you" },
    { type: "text_contains", value: "Thank you for applying" },
  ],
  failure_indicators: [{ type: "text_contains", value: "required field" }],
  anti_bot: { type: "none" },
};

export const SEED_CARRIERS: CarrierSeed[] = [
  {
    name: "Atlanta Reefer Co (composite)",
    legalName: "Atlanta Reefer Holdings LLC",
    kind: "partner",
    tier: "tier_2",
    phtpReferralAgreementActive: true,
    jobs: [
      {
        positionTitle: "OTR CDL-A Reefer Driver — Atlanta Terminal",
        domicileCity: "Atlanta",
        domicileState: "GA",
        domicileZip: "30303",
        domicileLat: "33.749000",
        domicileLng: "-84.388000",
        hiringRadiusMiles: 75,
        equipment: "reefer",
        minExperienceMonths: 24,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 1800,
        displayPayMin: 1400,
        displayPayMax: 1800,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["reefer", "dry-van"],
        preferredRegions: ["southeast", "georgia"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/atlanta-reefer/12345",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "Midwest Dry Van (composite)",
    legalName: "Midwest Dry Van Inc.",
    kind: "partner",
    tier: "tier_2",
    phtpReferralAgreementActive: true,
    jobs: [
      {
        positionTitle: "Regional CDL-A Dry Van Driver — Indianapolis",
        domicileCity: "Indianapolis",
        domicileState: "IN",
        domicileZip: "46204",
        domicileLat: "39.768000",
        domicileLng: "-86.158000",
        hiringRadiusMiles: 100,
        equipment: "dry-van",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 1650,
        displayPayMin: 1250,
        displayPayMax: 1650,
        sapTolerance: "accepts_none",
        preferredEquipmentExperience: ["dry-van"],
        preferredRegions: ["midwest"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/midwest-dryvan/23456",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "Texas Flatbed Group (composite)",
    legalName: "Texas Flatbed Group LLC",
    kind: "partner",
    tier: "tier_2",
    phtpReferralAgreementActive: true,
    jobs: [
      {
        positionTitle: "CDL-A Flatbed Driver — Dallas Terminal",
        domicileCity: "Dallas",
        domicileState: "TX",
        domicileZip: "75201",
        domicileLat: "32.776000",
        domicileLng: "-96.797000",
        hiringRadiusMiles: 150,
        equipment: "flatbed",
        minExperienceMonths: 18,
        acceptedHomeTimeTypes: ["weekly", "biweekly", "otr"],
        payRangeMaxWeeklyUsd: 2000,
        displayPayMin: 1500,
        displayPayMax: 2000,
        requiredEndorsements: [],
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["flatbed", "step-deck"],
        preferredRegions: ["texas", "southwest"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/texas-flatbed/34567",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "Southeast Multi-Equipment (composite)",
    legalName: "Southeast Multi-Equipment Co",
    kind: "subscription",
    tier: "tier_1",
    tier1BillingStatus: "current",
    tier1StartedAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
    jobs: [
      {
        positionTitle: "Sponsored — CDL-A Reefer — Atlanta",
        domicileCity: "Atlanta",
        domicileState: "GA",
        domicileZip: "30308",
        domicileLat: "33.749000",
        domicileLng: "-84.388000",
        hiringRadiusMiles: 75,
        equipment: "reefer",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 2050,
        displayPayMin: 1550,
        displayPayMax: 2050,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["reefer"],
        preferredRegions: ["southeast"],
        applicationSurface: "custom_intake_form",
        applicationUrl: "https://example-southeast-multi.com/apply",
        applicationFormSchema: EXAMPLE_FORM_SCHEMA,
        dataSource: "manual_subscription_onboarding",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
      {
        positionTitle: "Sponsored — CDL-A Dry Van — Charlotte",
        domicileCity: "Charlotte",
        domicileState: "NC",
        domicileZip: "28202",
        domicileLat: "35.227000",
        domicileLng: "-80.843000",
        hiringRadiusMiles: 100,
        equipment: "dry-van",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 1850,
        displayPayMin: 1400,
        displayPayMax: 1850,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["dry-van"],
        preferredRegions: ["southeast", "mid-atlantic"],
        applicationSurface: "custom_intake_form",
        applicationUrl: "https://example-southeast-multi.com/apply",
        applicationFormSchema: EXAMPLE_FORM_SCHEMA,
        dataSource: "manual_subscription_onboarding",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
      {
        positionTitle: "Sponsored — CDL-A Flatbed — Jacksonville",
        domicileCity: "Jacksonville",
        domicileState: "FL",
        domicileZip: "32202",
        domicileLat: "30.332000",
        domicileLng: "-81.656000",
        hiringRadiusMiles: 100,
        equipment: "flatbed",
        minExperienceMonths: 18,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 2100,
        displayPayMin: 1600,
        displayPayMax: 2100,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["flatbed"],
        preferredRegions: ["southeast", "florida"],
        applicationSurface: "custom_intake_form",
        applicationUrl: "https://example-southeast-multi.com/apply",
        applicationFormSchema: EXAMPLE_FORM_SCHEMA,
        dataSource: "manual_subscription_onboarding",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "Florida Regional (composite)",
    legalName: "Florida Regional Trucking LLC",
    kind: "subscription",
    tier: "tier_2",
    jobs: [
      {
        positionTitle: "CDL-A Reefer — Orlando Hub",
        domicileCity: "Orlando",
        domicileState: "FL",
        domicileZip: "32801",
        domicileLat: "28.538000",
        domicileLng: "-81.379000",
        hiringRadiusMiles: 150,
        equipment: "reefer",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 1750,
        displayPayMin: 1300,
        displayPayMax: 1750,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["reefer"],
        preferredRegions: ["florida", "southeast"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/florida-regional/45678",
        dataSource: "manual_subscription_onboarding",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "Prospect Sparse Carrier (composite)",
    legalName: "Sparse Data Trucking Inc.",
    kind: "prospect",
    tier: "none",
    businessAddressLat: "29.762000",
    businessAddressLng: "-95.382000",
    jobs: [
      {
        positionTitle: "CDL-A Flatbed Driver",
        domicileCity: "Houston",
        domicileState: "TX",
        domicileLat: "29.762000",
        domicileLng: "-95.382000",
        hiringRadiusMiles: 200,
        equipment: "flatbed",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly", "otr"],
        payRangeMaxWeeklyUsd: null,
        sapTolerance: "accepts_none",
        preferredEquipmentExperience: [],
        preferredRegions: [],
        applicationSurface: "unknown",
        dataSource: "fmcsa_census_scrape",
        verificationStatus: "unverified",
        dataQuality: "minimal",
        lastVerifiedAt: null,
      },
    ],
  },
  {
    name: "Mountain West Carriers (composite)",
    legalName: "Mountain West Carriers Inc.",
    kind: "subscription",
    tier: "tier_2",
    jobs: [
      {
        positionTitle: "CDL-A Dry Van — Denver Terminal",
        domicileCity: "Denver",
        domicileState: "CO",
        domicileZip: "80202",
        domicileLat: "39.739000",
        domicileLng: "-104.985000",
        hiringRadiusMiles: 75,
        equipment: "dry-van",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["weekly", "biweekly"],
        payRangeMaxWeeklyUsd: 1700,
        displayPayMin: 1300,
        displayPayMax: 1700,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["dry-van"],
        preferredRegions: ["mountain-west"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/mountain-west/56789",
        dataSource: "manual_subscription_onboarding",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
  {
    name: "National OTR Fleet (composite)",
    legalName: "National OTR Fleet LLC",
    kind: "partner",
    tier: "tier_2",
    phtpReferralAgreementActive: true,
    jobs: [
      {
        positionTitle: "OTR CDL-A Dry Van — Nationwide",
        domicileCity: "Memphis",
        domicileState: "TN",
        domicileZip: "38103",
        domicileLat: "35.149000",
        domicileLng: "-90.049000",
        hiringRadiusMiles: null,
        equipment: "dry-van",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["otr"],
        payRangeMaxWeeklyUsd: 1950,
        displayPayMin: 1500,
        displayPayMax: 1950,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["dry-van"],
        preferredRegions: ["any"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/national-otr/67890",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
      {
        positionTitle: "Texas-Domiciled OTR CDL-A Flatbed",
        domicileCity: "San Antonio",
        domicileState: "TX",
        domicileZip: "78205",
        domicileLat: "29.424000",
        domicileLng: "-98.494000",
        hiringRadiusMiles: 100,
        equipment: "flatbed",
        minExperienceMonths: 12,
        acceptedHomeTimeTypes: ["otr"],
        payRangeMaxWeeklyUsd: 2100,
        displayPayMin: 1600,
        displayPayMax: 2100,
        sapTolerance: "accepts_completed_only",
        preferredEquipmentExperience: ["flatbed"],
        preferredRegions: ["texas"],
        applicationSurface: "tenstreet_intelliapp",
        applicationUrl: "https://tenstreet.com/apply/national-otr-flatbed/67891",
        dataSource: "manual_partner_intake",
        verificationStatus: "verified",
        dataQuality: "complete",
        lastVerifiedAt: RECENT,
      },
    ],
  },
];

export async function seedCarriers(db: ReturnType<typeof drizzle>) {
  await db.execute(sql`TRUNCATE TABLE carrier_jobs, carriers RESTART IDENTITY CASCADE`);

  let jobCount = 0;
  for (const c of SEED_CARRIERS) {
    const [row] = await db
      .insert(carriers)
      .values({
        name: c.name,
        legalName: c.legalName,
        kind: c.kind,
        tier: c.tier,
        status: "active",
        tier1BillingStatus: c.tier1BillingStatus ?? null,
        tier1StartedAt: c.tier1StartedAt ?? null,
        phtpReferralAgreementActive: c.phtpReferralAgreementActive ?? false,
        businessAddressLat: c.businessAddressLat ?? null,
        businessAddressLng: c.businessAddressLng ?? null,
      })
      .returning({ id: carriers.id });

    if (!row) continue;

    if (c.jobs.length > 0) {
      await db.insert(carrierJobs).values(
        c.jobs.map((j) => ({
          carrierId: row.id,
          status: "active" as const,
          positionTitle: j.positionTitle,
          domicileCity: j.domicileCity,
          domicileState: j.domicileState,
          domicileZip: j.domicileZip ?? null,
          domicileLat: j.domicileLat,
          domicileLng: j.domicileLng,
          hiringRadiusMiles: j.hiringRadiusMiles,
          equipment: j.equipment,
          minExperienceMonths: j.minExperienceMonths,
          minOtrExperienceMonths: j.minOtrExperienceMonths ?? null,
          acceptedCdlStates: j.acceptedCdlStates ?? [],
          requiredEndorsements: j.requiredEndorsements ?? [],
          acceptedHomeTimeTypes: j.acceptedHomeTimeTypes,
          payRangeMaxWeeklyUsd: j.payRangeMaxWeeklyUsd ?? null,
          displayPayRangeMinWeeklyUsd: j.displayPayMin ?? null,
          displayPayRangeMaxWeeklyUsd: j.displayPayMax ?? null,
          acceptsTerminated: j.acceptsTerminated ?? false,
          acceptsFailedDotTest: j.acceptsFailedDotTest ?? false,
          sapTolerance: j.sapTolerance ?? "accepts_none",
          preferredEquipmentExperience: j.preferredEquipmentExperience ?? [],
          preferredRegions: j.preferredRegions ?? [],
          applicationSurface: j.applicationSurface,
          applicationUrl: j.applicationUrl ?? null,
          applicationEmail: j.applicationEmail ?? null,
          applicationPhone: j.applicationPhone ?? null,
          applicationFormSchema: j.applicationFormSchema ?? null,
          dataSource: j.dataSource,
          verificationStatus: j.verificationStatus,
          dataQuality: j.dataQuality,
          lastVerifiedAt: j.lastVerifiedAt ?? null,
        })),
      );
      jobCount += c.jobs.length;
    }
  }

  return { carrierCount: SEED_CARRIERS.length, jobCount };
}

async function main() {
  const client = postgres(url!, { max: 1 });
  const db = drizzle(client);

  console.log("Wiping drivers + carrier_jobs + carriers...");
  await db.execute(sql`TRUNCATE TABLE drivers RESTART IDENTITY CASCADE`);

  console.log("Loading zip codes...");
  const zipResult = await importZipCodes(db);
  if (zipResult.skipped) {
    console.log(`  zip_codes already populated (${zipResult.inserted} rows)`);
  } else {
    console.log(`  imported ${zipResult.inserted} zip codes`);
  }

  console.log(`Inserting ${SEED_CARRIERS.length} carriers...`);
  const { carrierCount, jobCount } = await seedCarriers(db);

  const counts = await db.execute<{ table: string; n: number }>(
    sql`select 'carriers' as table, count(*)::int as n from carriers
        union all select 'carrier_jobs', count(*)::int from carrier_jobs
        union all select 'zip_codes', count(*)::int from zip_codes
        union all select 'drivers', count(*)::int from drivers`,
  );
  console.log(`Seed complete (carriers=${carrierCount}, jobs=${jobCount}):`);
  for (const r of counts) console.log(`  ${r.table}: ${r.n}`);

  await client.end();
}

if (
  process.argv[1] &&
  (process.argv[1].endsWith("seed.ts") || process.argv[1].endsWith("seed.js"))
) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}
