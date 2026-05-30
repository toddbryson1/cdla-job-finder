// Application-surface classifier per SPEC_prospect-carrier-job-ingestion-v1.md
// §5.2 — given an apply URL, return one of the five application_surface
// enum values:
//
//   - tenstreet_intelliapp  → Tenstreet IntelliApp (DOT/FCRA-regulated)
//   - custom_intake_form    → carrier-self-hosted or ATS-hosted form
//                             (Workday, Greenhouse, Lever, etc.)
//   - email_only            → mailto: URLs
//   - phone_only            → tel: URLs
//   - unknown               → couldn't tell; the UI shows "apply
//                             directly via the carrier's link"
//
// We deliberately err toward `unknown` rather than miscategorize.
// Misclassifying a Tenstreet/IntelliApp URL as `custom_intake_form`
// would cause the future submission pipeline to try to auto-submit
// FCRA-regulated data, which is the precise outcome the spec says
// to avoid (§5.3, §6.5).

export type ApplicationSurface =
  | "tenstreet_intelliapp"
  | "custom_intake_form"
  | "email_only"
  | "phone_only"
  | "unknown";

// Host suffixes that conclusively identify a Tenstreet/IntelliApp
// hosted application. All of these are DOT/FCRA Type-2 surfaces.
const TENSTREET_HOST_SUFFIXES = [
  "tenstreet.com",
  "tenstreet-co.com",
  "driverapponline.com", // intelliapp.driverapponline.com
  "driverreach.com", // careers.driverreach.com
];

// ATS platforms that host their own application forms. Some of
// these are Type-1 (basic intake), some are Type-2; we mark them
// all as `custom_intake_form` and let downstream classify further
// when we have form-schema authoring.
const ATS_HOST_SUFFIXES = [
  "myworkdayjobs.com",
  "boards.greenhouse.io",
  "jobs.lever.co",
  "icims.com",
  "bamboohr.com",
  "smartrecruiters.com",
  "ultipro.com",
  "successfactors.com",
  "workable.com",
  "applytojob.com",
  "paylocity.com",
];

export interface ClassifySurfaceInput {
  applyUrl: string;
  /** Optional carrier homepage host for self-hosted-form detection. */
  carrierHost?: string;
}

export interface ClassifySurfaceResult {
  surface: ApplicationSurface;
  /** Short reason for telemetry/UI ("matched tenstreet.com host"). */
  reason: string;
}

export function classifyApplicationSurface(
  input: ClassifySurfaceInput,
): ClassifySurfaceResult {
  const { applyUrl, carrierHost } = input;
  if (!applyUrl || typeof applyUrl !== "string") {
    return { surface: "unknown", reason: "no apply URL" };
  }

  const trimmed = applyUrl.trim();

  // mailto: → email_only.
  if (/^mailto:/i.test(trimmed)) {
    return { surface: "email_only", reason: "mailto: URL" };
  }
  // tel: → phone_only.
  if (/^tel:/i.test(trimmed)) {
    return { surface: "phone_only", reason: "tel: URL" };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { surface: "unknown", reason: "malformed URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { surface: "unknown", reason: `unsupported protocol ${url.protocol}` };
  }

  const host = url.host.toLowerCase();

  for (const suffix of TENSTREET_HOST_SUFFIXES) {
    if (hostMatches(host, suffix)) {
      return {
        surface: "tenstreet_intelliapp",
        reason: `matched Tenstreet host suffix ${suffix}`,
      };
    }
  }

  for (const suffix of ATS_HOST_SUFFIXES) {
    if (hostMatches(host, suffix)) {
      return {
        surface: "custom_intake_form",
        reason: `matched ATS host suffix ${suffix}`,
      };
    }
  }

  // Self-hosted on carrier domain (or one we walked to via the
  // crawler subdomain hop, like driveheartland.com). We assume it
  // is a custom intake form; the future form-schema authoring path
  // (spec §5.4) inspects fields to confirm.
  if (carrierHost) {
    const carrierBase = stripWww(carrierHost.toLowerCase());
    if (hostMatches(host, carrierBase)) {
      return {
        surface: "custom_intake_form",
        reason: `same-domain as carrier (${carrierBase})`,
      };
    }
  }

  return { surface: "unknown", reason: `no rule matched host ${host}` };
}

function hostMatches(actualHost: string, suffix: string): boolean {
  const s = suffix.toLowerCase();
  return actualHost === s || actualHost.endsWith(`.${s}`);
}

function stripWww(host: string): string {
  return host.replace(/^www\./, "");
}
