import { z } from "zod";

export const EQUIPMENT_OPTIONS = [
  { value: "reefer", label: "Reefer" },
  { value: "dry-van", label: "Dry van" },
  { value: "flatbed", label: "Flatbed" },
  { value: "tanker", label: "Tanker" },
  { value: "hazmat", label: "Hazmat" },
  { value: "auto-hauler", label: "Auto hauler" },
  { value: "doubles", label: "Doubles" },
  { value: "triples", label: "Triples" },
  { value: "oversized", label: "Oversized / heavy haul" },
  { value: "dump", label: "Dump" },
  { value: "mixer", label: "Mixer" },
  { value: "intermodal", label: "Intermodal" },
] as const;

export const ENDORSEMENT_OPTIONS = [
  { value: "hazmat", label: "Hazmat (H)" },
  { value: "tanker", label: "Tanker (N)" },
  { value: "hazmat-tanker", label: "Hazmat + tanker (X)" },
  { value: "doubles-triples", label: "Doubles/triples (T)" },
  { value: "twic", label: "TWIC card" },
  { value: "passenger", label: "Passenger (P)" },
  { value: "school-bus", label: "School bus (S)" },
] as const;

export const HOME_TIME_OPTIONS = [
  { value: "daily", label: "Home daily" },
  { value: "weekly", label: "Home weekly" },
  { value: "biweekly", label: "Home every 2 weeks" },
  { value: "otr", label: "OTR — out 3+ weeks at a time is fine" },
] as const;

export const REGION_PREF_OPTIONS = [
  { value: "any", label: "Any region — show me everything that fits" },
  { value: "southeast", label: "Southeast" },
  { value: "midwest", label: "Midwest" },
  { value: "northeast", label: "Northeast" },
  { value: "west-coast", label: "West Coast" },
  { value: "gulf-coast", label: "Gulf Coast" },
  { value: "southwest", label: "Southwest" },
  { value: "texas", label: "Texas" },
  { value: "california", label: "California" },
  { value: "florida", label: "Florida" },
  { value: "georgia", label: "Georgia" },
  { value: "ohio", label: "Ohio" },
] as const;

export const SAP_STATUS_OPTIONS = [
  { value: "not-in-sap", label: "Never been in SAP" },
  { value: "in-sap", label: "Currently in SAP program" },
  { value: "completed-sap", label: "Completed SAP" },
] as const;

const usStateCode = z
  .string()
  .trim()
  .length(2, "Use the 2-letter state code")
  .transform((s) => s.toUpperCase());

export const intakeSchema = z.object({
  // Step 1: Contact + CDL
  firstName: z.string().trim().min(1, "First name is required"),
  lastName: z.string().trim().min(1, "Last name is required"),
  email: z.string().trim().toLowerCase().email("That doesn't look like an email"),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s().-]{10,}$/, "Phone needs at least 10 digits"),
  hasClassA: z.literal(true, {
    message: "Sorry — CDLA.jobs is for Class A drivers only.",
  }),
  cdlState: usStateCode,
  homeZip: z
    .string()
    .trim()
    .regex(/^\d{5}$/, "Use a 5-digit US zip"),
  yearsHeld: z.coerce.number().int().min(0).max(60),

  // Step 2: Experience + Equipment
  equipmentRun: z
    .array(z.string())
    .min(1, "Pick at least one equipment type you've actually driven"),
  endorsements: z.array(z.string()).default([]),
  otrYears: z.coerce.number().int().min(0).max(60).default(0),

  // Step 3: Preferences
  desiredEquipment: z
    .array(z.string())
    .min(1, "Pick at least one equipment type you want to drive"),
  desiredRegions: z.array(z.string()).min(1, "Pick at least one region"),
  homeTime: z
    .array(z.enum(["daily", "weekly", "biweekly", "otr"]))
    .min(1, "Pick at least one home time that works for you"),
  minWeeklyPay: z.coerce.number().int().min(0).max(10000).default(0),
  willingToRelocate: z.boolean().default(false),

  // Step 4: Safety (6 mandatory questions, verbatim from pitch deck slide 6)
  accidents3yrCount: z.coerce.number().int().min(0).max(50),
  accidentsDetails: z.string().trim().max(2000).default(""),
  tickets3yrCount: z.coerce.number().int().min(0).max(50),
  duiEver: z.boolean(),
  // Free-text date entry (e.g. "March 2019") preserved at the form layer;
  // server stores it parsed into a real date column when possible (out of
  // scope for this session — the column is nullable until intake captures
  // a structured date).
  duiMostRecentDate: z.string().trim().max(40).default(""),
  felonyEver: z.boolean(),
  felonyDetails: z.string().trim().max(2000).default(""),
  terminatedFromAnyOfLast3Employers: z.boolean(),
  failedDotTest: z.boolean(),
  sapStatus: z.enum(["not-in-sap", "in-sap", "completed-sap"]).default("not-in-sap"),

  // Consent
  attestAccurate: z.literal(true, {
    message: "We need you to confirm what you've told us is accurate",
  }),
  consentToShare: z.literal(true, {
    message:
      "We need your consent to share your info with carriers you specifically pick",
  }),
  smsOptIn: z.boolean().default(false),
});

export type IntakeInput = z.input<typeof intakeSchema>;
export type IntakeOutput = z.output<typeof intakeSchema>;
