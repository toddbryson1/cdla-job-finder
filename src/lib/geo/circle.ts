// Build a GeoJSON Polygon approximating a circle of `radiusMiles` around
// a point. Used to draw a carrier's circular hiring area on the running-
// area map when the job has a hiring_radius_miles but no explicit
// hiring_polygon. Pure + dependency-free so it's unit-testable and runs
// the same on server and client.

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][]; // [ [ [lng, lat], ... ] ]
}

const EARTH_RADIUS_MILES = 3958.8;

/**
 * @param lat         center latitude (degrees)
 * @param lng         center longitude (degrees)
 * @param radiusMiles circle radius in miles
 * @param steps       number of vertices (more = smoother). 64 is plenty.
 */
export function circlePolygonGeoJson(
  lat: number,
  lng: number,
  radiusMiles: number,
  steps = 64,
): GeoJsonPolygon {
  const coords: number[][] = [];
  // Angular distance of the radius, in radians, over the sphere.
  const angular = radiusMiles / EARTH_RADIUS_MILES;
  const latRad = (lat * Math.PI) / 180;
  const lngRad = (lng * Math.PI) / 180;

  for (let i = 0; i <= steps; i += 1) {
    const bearing = (i / steps) * 2 * Math.PI;
    const lat2 = Math.asin(
      Math.sin(latRad) * Math.cos(angular) +
        Math.cos(latRad) * Math.sin(angular) * Math.cos(bearing),
    );
    const lng2 =
      lngRad +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(latRad),
        Math.cos(angular) - Math.sin(latRad) * Math.sin(lat2),
      );
    coords.push([(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  // GeoJSON rings must close (first point == last point).
  coords[coords.length - 1] = coords[0];
  return { type: "Polygon", coordinates: [coords] };
}
