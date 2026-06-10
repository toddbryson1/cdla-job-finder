// US state code ↔ name, plus the lower-48 set. Used to draw a job's
// running area by highlighting states on the map: the bundled
// public/us-states.geojson keys features by full state NAME, so we map
// our 2-letter codes to names to filter it.

export const STATE_NAME_BY_CODE: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

// Continental US (excludes AK, HI) — the "nationwide / OTR" running area.
export const LOWER_48: string[] = Object.keys(STATE_NAME_BY_CODE).filter(
  (c) => c !== "AK" && c !== "HI" && c !== "DC",
);

/** Map 2-letter state codes to the full names used by us-states.geojson. */
export function stateNamesFromCodes(codes: string[]): Set<string> {
  const names = new Set<string>();
  for (const c of codes) {
    const name = STATE_NAME_BY_CODE[c?.toUpperCase()];
    if (name) names.add(name);
  }
  return names;
}
