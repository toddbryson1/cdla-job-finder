import { describe, expect, it } from "vitest";
import { circlePolygonGeoJson } from "@/lib/geo/circle";

// Sanity-checks the circle approximation: closed ring, right vertex
// count, and a radius that lands within tolerance of the requested miles.

const EARTH_RADIUS_MILES = 3958.8;

function haversineMiles(a: number[], b: number[]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

describe("circlePolygonGeoJson", () => {
  it("returns a closed Polygon ring with steps+1 vertices", () => {
    const poly = circlePolygonGeoJson(33.749, -84.388, 100, 64);
    expect(poly.type).toBe("Polygon");
    const ring = poly.coordinates[0];
    expect(ring).toHaveLength(65);
    expect(ring[0]).toEqual(ring[ring.length - 1]); // closed
  });

  it("places every vertex ~radiusMiles from the center (±2%)", () => {
    const center = [-84.388, 33.749];
    const radius = 100;
    const ring = circlePolygonGeoJson(33.749, -84.388, radius).coordinates[0];
    for (const pt of ring) {
      const d = haversineMiles(center, pt);
      expect(d).toBeGreaterThan(radius * 0.98);
      expect(d).toBeLessThan(radius * 1.02);
    }
  });
});
