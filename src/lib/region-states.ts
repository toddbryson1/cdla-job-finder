/**
 * Maps region slugs to the 2-letter state codes they cover. Used to count
 * drivers by `cdl_state` against a region (which can be metro, single state,
 * or multi-state) for the `driver_count_in_region` stat.
 *
 * The doc spec calls for `address_state`, but the intake form doesn't collect
 * a home-address state yet, so `cdl_state` is the closest proxy.
 */
export const REGION_TO_STATES: Record<string, string[]> = {
  // Metros
  atlanta: ["GA"],
  dallas: ["TX"],
  houston: ["TX"],
  chicago: ["IL"],
  denver: ["CO"],
  phoenix: ["AZ"],
  sacramento: ["CA"],
  miami: ["FL"],

  // Single states
  texas: ["TX"],
  georgia: ["GA"],
  california: ["CA"],
  florida: ["FL"],
  ohio: ["OH"],

  // Multi-state
  southeast: ["GA", "FL", "AL", "SC", "NC", "TN"],
  midwest: ["IL", "IN", "OH", "MI", "WI", "MO", "IA"],
  northeast: ["NY", "PA", "NJ", "MA", "CT", "RI", "VT", "NH", "ME"],
  "west-coast": ["CA", "OR", "WA"],
  "gulf-coast": ["TX", "LA", "MS", "AL", "FL"],
  southwest: ["AZ", "NM", "NV", "UT"],

  // Lanes
  "i95-corridor": ["FL", "GA", "SC", "NC", "VA", "MD", "DE", "NJ", "NY", "CT", "MA"],
  "midwest-to-southeast": ["IL", "IN", "OH", "KY", "TN", "GA", "AL"],
};

export function statesForRegion(slug: string): string[] {
  return REGION_TO_STATES[slug] ?? [];
}
