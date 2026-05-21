export type RegionSlug = string;
export type EquipmentSlug = string;

export interface RegionInfo {
  displayName: string;
  humanized: string;
  state?: string;
}

export interface EquipmentInfo {
  displayName: string;
  humanized: string;
}

export const REGIONS: Record<RegionSlug, RegionInfo> = {
  // Metros
  atlanta: { displayName: "Atlanta, GA", humanized: "the Atlanta metro area", state: "GA" },
  dallas: { displayName: "Dallas, TX", humanized: "the Dallas–Fort Worth area", state: "TX" },
  houston: { displayName: "Houston, TX", humanized: "the Houston area", state: "TX" },
  chicago: { displayName: "Chicago, IL", humanized: "the Chicago area", state: "IL" },
  denver: { displayName: "Denver, CO", humanized: "the Denver area", state: "CO" },
  phoenix: { displayName: "Phoenix, AZ", humanized: "the Phoenix area", state: "AZ" },
  sacramento: { displayName: "Sacramento, CA", humanized: "the Sacramento area", state: "CA" },
  miami: { displayName: "Miami, FL", humanized: "the Miami area", state: "FL" },

  // States
  texas: { displayName: "Texas", humanized: "Texas" },
  georgia: { displayName: "Georgia", humanized: "Georgia" },
  california: { displayName: "California", humanized: "California" },
  florida: { displayName: "Florida", humanized: "Florida" },
  ohio: { displayName: "Ohio", humanized: "Ohio" },

  // Multi-state regions
  southeast: { displayName: "the Southeast", humanized: "the Southeast" },
  midwest: { displayName: "the Midwest", humanized: "the Midwest" },
  northeast: { displayName: "the Northeast", humanized: "the Northeast" },
  "west-coast": { displayName: "the West Coast", humanized: "the West Coast" },
  "gulf-coast": { displayName: "the Gulf Coast", humanized: "the Gulf Coast" },
  southwest: { displayName: "the Southwest", humanized: "the Southwest" },

  // Lanes
  "i95-corridor": { displayName: "the I-95 corridor", humanized: "the I-95 corridor" },
  "midwest-to-southeast": {
    displayName: "Midwest-to-Southeast lanes",
    humanized: "the Midwest-to-Southeast lanes",
  },
};

export const EQUIPMENT: Record<EquipmentSlug, EquipmentInfo> = {
  reefer: { displayName: "Reefer", humanized: "a reefer driver" },
  "dry-van": { displayName: "Dry van", humanized: "a dry van driver" },
  flatbed: { displayName: "Flatbed", humanized: "a flatbed driver" },
  tanker: { displayName: "Tanker", humanized: "a tanker driver" },
  hazmat: { displayName: "Hazmat", humanized: "a hazmat driver" },
  "auto-hauler": { displayName: "Auto hauler", humanized: "a car-carrier driver" },
  doubles: { displayName: "Doubles", humanized: "a doubles driver" },
  triples: { displayName: "Triples", humanized: "a triples driver" },
  oversized: { displayName: "Oversized / heavy haul", humanized: "a heavy-haul driver" },
  dump: { displayName: "Dump", humanized: "a dump driver" },
  mixer: { displayName: "Mixer", humanized: "a mixer driver" },
  intermodal: { displayName: "Intermodal", humanized: "an intermodal driver" },
  otr: { displayName: "OTR", humanized: "an OTR driver" },
  local: { displayName: "Local", humanized: "a local driver" },
  regional: { displayName: "Regional", humanized: "a regional driver" },
};

export interface ParsedSlug {
  region: RegionSlug;
  equipment: EquipmentSlug;
  regionInfo: RegionInfo;
  equipmentInfo: EquipmentInfo;
}

export function parseJobSlug(slug: string): ParsedSlug | null {
  const equipmentKeys = Object.keys(EQUIPMENT).sort((a, b) => b.length - a.length);
  for (const eq of equipmentKeys) {
    const suffix = `-${eq}`;
    if (slug.endsWith(suffix)) {
      const region = slug.slice(0, -suffix.length);
      const regionInfo = REGIONS[region];
      const equipmentInfo = EQUIPMENT[eq];
      if (regionInfo && equipmentInfo) {
        return { region, equipment: eq, regionInfo, equipmentInfo };
      }
    }
  }
  return null;
}

export function buildJobSlug(region: RegionSlug, equipment: EquipmentSlug): string {
  return `${region}-${equipment}`;
}
