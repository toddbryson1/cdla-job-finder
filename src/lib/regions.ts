// US state code → human-readable state name. Used by:
//   - Driver candidate email (region resolution per spec §5)
//   - /api/intake when populating the GHL contact's `state` field so
//     nurture email templates can render {{contact.state}} as
//     "Colorado" instead of "CO"

export const US_STATE_NAMES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "Washington, D.C.",
};

/**
 * Resolve a 2-letter US state code to a human-readable state name.
 * Returns "your area" if the code is missing or unknown — spec-approved
 * fallback per candidate-email spec §5.
 */
export function resolveRegion(stateCode: string | null | undefined): string {
  if (!stateCode) return "your area";
  return US_STATE_NAMES[stateCode.toUpperCase()] ?? "your area";
}
