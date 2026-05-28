// Region-slug → SQL predicate translator.
//
// /jobs/[region-equipment] landing pages mix three kinds of regions:
//
//   metro:        slugs like "atlanta", "phoenix", "dallas" — match
//                 carrier_jobs whose domicile is within RADIUS_MILES
//                 of the metro's lat/lng.
//   state:        slugs like "texas", "georgia" — match carrier_jobs
//                 with domicile_state = 'TX' / 'GA'.
//   multi-state:  slugs like "southeast", "midwest" — match
//                 carrier_jobs with domicile_state IN (...).
//
// Lanes ("i95-corridor", "midwest-to-southeast") are approximated as
// multi-state until we add route-corridor modeling.
//
// The resolver returns:
//   - a SQL fragment usable in a WHERE clause to scope carrier_jobs
//     to the region
//   - a state-array for driver_count proxy queries (drivers.cdl_state
//     comparison) where we don't have geo on drivers yet

import { sql, type SQL } from "drizzle-orm";
import type { RegionSlug } from "@/lib/slugs";

const METRO_RADIUS_MILES = 100;

// Serialize a JS string[] to a Postgres text[] literal. Drizzle's sql
// template binds JS arrays as scalar parameters, which the driver
// can't coerce to text[] — we route through a literal string cast.
// Same pattern as @/lib/matching/hardFilter.ts.
function toPgTextArray(values: string[]): string {
  if (values.length === 0) return "{}";
  const escaped = values.map(
    (v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`,
  );
  return `{${escaped.join(",")}}`;
}

interface MetroGeo {
  kind: "metro";
  lat: number;
  lng: number;
  radiusMiles: number;
  // The state the metro sits in — used for the driver-count proxy
  // (which counts drivers by cdl_state until we collect home address).
  state: string;
}

interface StateGeo {
  kind: "states";
  states: string[];
}

export type RegionGeo = MetroGeo | StateGeo;

const METROS: Partial<Record<RegionSlug, MetroGeo>> = {
  atlanta: {
    kind: "metro",
    lat: 33.749,
    lng: -84.388,
    radiusMiles: METRO_RADIUS_MILES,
    state: "GA",
  },
  dallas: {
    kind: "metro",
    lat: 32.7767,
    lng: -96.797,
    radiusMiles: METRO_RADIUS_MILES,
    state: "TX",
  },
  houston: {
    kind: "metro",
    lat: 29.7604,
    lng: -95.3698,
    radiusMiles: METRO_RADIUS_MILES,
    state: "TX",
  },
  chicago: {
    kind: "metro",
    lat: 41.8781,
    lng: -87.6298,
    radiusMiles: METRO_RADIUS_MILES,
    state: "IL",
  },
  denver: {
    kind: "metro",
    lat: 39.7392,
    lng: -104.9903,
    radiusMiles: METRO_RADIUS_MILES,
    state: "CO",
  },
  phoenix: {
    kind: "metro",
    lat: 33.4484,
    lng: -112.074,
    radiusMiles: METRO_RADIUS_MILES,
    state: "AZ",
  },
  sacramento: {
    kind: "metro",
    lat: 38.5816,
    lng: -121.4944,
    radiusMiles: METRO_RADIUS_MILES,
    state: "CA",
  },
  miami: {
    kind: "metro",
    lat: 25.7617,
    lng: -80.1918,
    radiusMiles: METRO_RADIUS_MILES,
    state: "FL",
  },
};

const STATE_GROUPS: Partial<Record<RegionSlug, string[]>> = {
  texas: ["TX"],
  georgia: ["GA"],
  california: ["CA"],
  florida: ["FL"],
  ohio: ["OH"],
  // Multi-state regions — Census-ish groupings.
  southeast: ["GA", "FL", "AL", "SC", "NC", "TN", "MS", "LA", "AR"],
  midwest: ["IL", "IN", "OH", "MI", "WI", "MO", "MN", "IA", "KS", "NE"],
  northeast: ["NY", "NJ", "PA", "MA", "CT", "RI", "NH", "VT", "ME", "MD", "DE"],
  "west-coast": ["CA", "OR", "WA"],
  "gulf-coast": ["TX", "LA", "MS", "AL", "FL"],
  southwest: ["TX", "OK", "NM", "AZ", "NV"],
  // Lanes — approximated as the states the corridor touches.
  "i95-corridor": [
    "FL",
    "GA",
    "SC",
    "NC",
    "VA",
    "MD",
    "DE",
    "PA",
    "NJ",
    "NY",
    "CT",
    "RI",
    "MA",
    "NH",
    "ME",
  ],
  "midwest-to-southeast": [
    "IL",
    "IN",
    "OH",
    "KY",
    "TN",
    "GA",
    "AL",
    "MS",
    "NC",
    "SC",
  ],
};

export function resolveRegionGeo(slug: RegionSlug): RegionGeo | null {
  const metro = METROS[slug];
  if (metro) return metro;
  const states = STATE_GROUPS[slug];
  if (states) return { kind: "states", states };
  return null;
}

/**
 * SQL fragment scoping carrier_jobs to this region.
 * Apply to the `j` alias of carrier_jobs in your query.
 *
 * For metros: haversine distance from the metro center to j.domicile_lat/lng
 *   must be ≤ radiusMiles.
 * For state groups: j.domicile_state must be IN the state list.
 */
export function carrierJobsInRegionSql(geo: RegionGeo): SQL {
  if (geo.kind === "metro") {
    return sql`
      3959 * acos(
        LEAST(1.0, GREATEST(-1.0,
          cos(radians(${geo.lat}::numeric)) * cos(radians(domicile_lat)) *
          cos(radians(domicile_lng) - radians(${geo.lng}::numeric)) +
          sin(radians(${geo.lat}::numeric)) * sin(radians(domicile_lat))
        ))
      ) <= ${geo.radiusMiles}
    `;
  }
  return sql`domicile_state = ANY(${toPgTextArray(geo.states)}::text[])`;
}

/**
 * States to count drivers against for the driver_count proxy.
 *
 * Drivers don't currently have lat/lng (intake only collects home_zip;
 * we'd have to lat-lng them via zip_codes). Until that lands we proxy
 * by cdl_state — for metros that's the metro's home state; for state
 * groups it's the group itself.
 */
export function driverProxyStates(geo: RegionGeo): string[] {
  if (geo.kind === "metro") return [geo.state];
  return geo.states;
}
