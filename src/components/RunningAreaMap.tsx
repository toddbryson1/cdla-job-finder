"use client";

import { useEffect, useRef, useState } from "react";
import { circlePolygonGeoJson, type GeoJsonPolygon } from "@/lib/geo/circle";

// Running-area map. Draws a carrier's hiring area — the real hiring_polygon
// when one is set, otherwise a circle from hiring_radius_miles — plus a pin
// for the carrier domicile and (on the driver's match card) their home.
//
// MapLibre GL is heavy (~230KB gz), so it's dynamically imported inside the
// effect: nothing ships in the initial bundle, and the map only loads when
// this component actually mounts (e.g. when a match card is expanded). Free
// CARTO raster basemap — no API key.

export interface RunningAreaMapProps {
  domicile: { lat: number; lng: number; label: string };
  hiringRadiusMiles: number | null;
  /** GeoJSON Polygon string from carrier_jobs.hiring_polygon (PostGIS). */
  hiringPolygonGeoJson?: string | null;
  /** Driver's home — drawn as a second pin on the match card. */
  home?: { lat: number; lng: number } | null;
  className?: string;
}

function parsePolygon(raw: string | null | undefined): GeoJsonPolygon | null {
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as GeoJsonPolygon;
    if (g && g.type === "Polygon" && Array.isArray(g.coordinates)) return g;
  } catch {
    /* malformed → fall through to radius */
  }
  return null;
}

const CARTO_TILES = [
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
];

export function RunningAreaMap({
  domicile,
  hiringRadiusMiles,
  hiringPolygonGeoJson,
  home,
  className,
}: RunningAreaMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);

  const hasDomicile =
    Number.isFinite(domicile?.lat) && Number.isFinite(domicile?.lng);

  useEffect(() => {
    if (!hasDomicile || !containerRef.current) return;
    let map: import("maplibre-gl").Map | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { default: maplibregl } = await import("maplibre-gl");
        await import("maplibre-gl/dist/maplibre-gl.css");
        if (cancelled || !containerRef.current) return;

        // The hiring area: real polygon if present, else a circle from the
        // radius. Null = OTR/nationwide — we just show the domicile pin.
        const area: GeoJsonPolygon | null =
          parsePolygon(hiringPolygonGeoJson) ??
          (hiringRadiusMiles && hiringRadiusMiles > 0
            ? circlePolygonGeoJson(domicile.lat, domicile.lng, hiringRadiusMiles)
            : null);

        map = new maplibregl.Map({
          container: containerRef.current,
          style: {
            version: 8,
            sources: {
              carto: {
                type: "raster",
                tiles: CARTO_TILES,
                tileSize: 256,
                attribution:
                  '© <a href="https://openstreetmap.org">OpenStreetMap</a> © <a href="https://carto.com/attributions">CARTO</a>',
              },
            },
            layers: [{ id: "carto", type: "raster", source: "carto" }],
          },
          center: [domicile.lng, domicile.lat],
          zoom: 6,
          attributionControl: { compact: true },
          cooperativeGestures: true, // don't hijack page scroll
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

        map.on("load", () => {
          if (!map) return;
          if (area) {
            map.addSource("hiring-area", {
              type: "geojson",
              data: { type: "Feature", geometry: area, properties: {} },
            });
            map.addLayer({
              id: "hiring-fill",
              type: "fill",
              source: "hiring-area",
              paint: { "fill-color": "#2E5C8A", "fill-opacity": 0.18 },
            });
            map.addLayer({
              id: "hiring-line",
              type: "line",
              source: "hiring-area",
              paint: { "line-color": "#1F3A5F", "line-width": 2 },
            });
          }

          // Carrier domicile pin (brand deep).
          new maplibregl.Marker({ color: "#1F3A5F" })
            .setLngLat([domicile.lng, domicile.lat])
            .setPopup(new maplibregl.Popup({ offset: 18 }).setText(domicile.label))
            .addTo(map);

          // Driver home pin (gold), when provided.
          if (home && Number.isFinite(home.lat) && Number.isFinite(home.lng)) {
            new maplibregl.Marker({ color: "#D4A017" })
              .setLngLat([home.lng, home.lat])
              .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Your home"))
              .addTo(map);
          }

          // Fit to whatever we drew.
          const bounds = new maplibregl.LngLatBounds();
          if (area) {
            for (const [lng, lat] of area.coordinates[0]) bounds.extend([lng, lat]);
          } else {
            bounds.extend([domicile.lng, domicile.lat]);
          }
          if (home && Number.isFinite(home.lat)) bounds.extend([home.lng, home.lat]);
          map.fitBounds(bounds, { padding: 36, maxZoom: 9, duration: 0 });
        });

        map.on("error", () => setFailed(true));
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [hasDomicile, domicile, hiringRadiusMiles, hiringPolygonGeoJson, home]);

  if (!hasDomicile) return null;
  if (failed) {
    return (
      <p className={"text-xs text-brand-muted " + (className ?? "")}>
        Map unavailable — {domicile.label}
        {hiringRadiusMiles ? `, hires within ${hiringRadiusMiles} miles` : ""}.
      </p>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-brand-rule"
        aria-label={`Map of ${domicile.label} hiring area`}
      />
    </div>
  );
}
