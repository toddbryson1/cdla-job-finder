import type { GetFirstMatchTime } from "./types";

/**
 * Stub: returns null until the driver_carrier_matches table is built
 * (separate session). The matchDriver engine treats null as "first match
 * is right now," which means a brand-new Tier 1 match is in its 24-hour
 * exclusivity window. Replace with a real DB lookup when the matches
 * table lands.
 */
export const defaultGetFirstMatchTime: GetFirstMatchTime = async () => null;
