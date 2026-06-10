// Derive a ROUGH running area for a job — where a driver on this lane
// actually drives — from the data we have (home-time type + the carrier's
// preferred regions + domicile). This is intentionally approximate: we
// don't have exact lane geometry, only the signals below.
//
//   - OTR / nationwide: no hiring radius (hires anywhere) or OTR-only home
//     time → the lower-48.
//   - Regional: the union of the job's preferred-region states (e.g.
//     "southeast" → GA/FL/AL/SC/NC/TN). Falls back to the domicile state
//     when no regions are set.
//   - Local: home-daily with a tight radius and no broad region → close to
//     the terminal (the map draws the radius circle for this scope).

import { statesForRegion } from "@/lib/region-states";
import { LOWER_48 } from "./us-states";

export type RunningScope = "local" | "regional" | "otr";

export interface RunningArea {
  scope: RunningScope;
  /** 2-letter state codes the lane covers. Empty for a pure-radius local. */
  states: string[];
}

export function deriveRunningArea(input: {
  acceptedHomeTimeTypes: string[];
  preferredRegions: string[];
  hiringRadiusMiles: number | null;
  domicileState: string | null;
}): RunningArea {
  const dom = input.domicileState ? input.domicileState.toUpperCase() : null;
  const home = new Set(input.acceptedHomeTimeTypes ?? []);

  // OTR / nationwide — no hiring radius means hires nationwide, or the lane
  // is OTR with no shorter home-time option.
  const otr =
    input.hiringRadiusMiles == null ||
    (home.has("otr") && !home.has("daily") && !home.has("weekly"));
  if (otr) {
    return { scope: "otr", states: LOWER_48 };
  }

  // Regional — the union of the job's preferred-region states.
  const regionStates = Array.from(
    new Set((input.preferredRegions ?? []).flatMap((r) => statesForRegion(r))),
  ).filter(Boolean);

  if (regionStates.length > 0) {
    return { scope: "regional", states: regionStates };
  }

  // No explicit regions. Home-daily + a tight radius reads as local; the map
  // draws the radius circle (not the whole state) for the 'local' scope.
  const isDaily = home.has("daily");
  if (isDaily) {
    return { scope: "local", states: dom ? [dom] : [] };
  }

  // Regional but unspecified — fall back to the domicile state.
  return { scope: "regional", states: dom ? [dom] : [] };
}
