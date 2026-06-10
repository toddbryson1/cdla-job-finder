"use client";

import { useEffect, useRef, useState } from "react";
import { circlePolygonGeoJson } from "@/lib/geo/circle";
import { stateNamesFromCodes } from "@/lib/geo/us-states";
import type { RunningScope } from "@/lib/geo/running-area";

// Running-area map. Shows roughly where a driver on this lane drives:
//   - regional / OTR → the covered states, highlighted on the map
//   - local          → a radius circle around the terminal
// Plus a pin for the carrier terminal and (on the match card) the driver's
// home, so they can see where they sit relative to the run.
//
// MapLibre GL is heavy (~230KB gz) and the us-states GeoJSON is ~90KB, so
// both are loaded only when this mounts (the match card is expanded / the
// section renders). Free CARTO basemap — no API key.

export interface RunningAreaMapProps {
  domicile: { lat: number; lng: number; label: string };
  running: { scope: RunningScope; states: string[] };
  /** Radius for the 'local' scope circle (the job's hiring radius). */
  localRadiusMiles?: number | null;
  /** Driver's home — drawn as a second pin on the match card. */
  home?: { lat: number; lng: number } | null;
  className?: string;
}

const CARTO_TILES = [
  "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
];

// Walk any Polygon/MultiPolygon geometry, extending the bounds.
function extendBounds(
  bounds: import("maplibre-gl").LngLatBounds,
  geometry: { type: string; coordinates: unknown },
) {
  const walk = (coords: unknown) => {
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === "number" &&
      typeof coords[1] === "number"
    ) {
      bounds.extend([coords[0], coords[1]] as [number, number]);
      return;
    }
    if (Array.isArray(coords)) coords.forEach(walk);
  };
  walk(geometry.coordinates);
}

export function RunningAreaMap({
  domicile,
  running,
  localRadiusMiles,
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
          zoom: 5,
          attributionControl: { compact: true },
          cooperativeGestures: true, // don't hijack page scroll
        });
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "top-right",
        );

        map.on("error", () => setFailed(true));

        map.on("load", async () => {
          if (!map) return;
          const bounds = new maplibregl.LngLatBounds();

          const drawByStates =
            running.scope !== "local" && running.states.length > 0;

          if (drawByStates) {
            // Highlight the covered states from the bundled GeoJSON.
            try {
              const res = await fetch("/us-states.geojson");
              const fc = (await res.json()) as {
                features: Array<{
                  properties: { name?: string };
                  geometry: { type: string; coordinates: unknown };
                }>;
              };
              const names = stateNamesFromCodes(running.states);
              const matched = fc.features.filter((f) =>
                names.has(f.properties?.name ?? ""),
              );
              if (matched.length > 0) {
                map.addSource("run-states", {
                  type: "geojson",
                  data: { type: "FeatureCollection", features: matched } as never,
                });
                map.addLayer({
                  id: "run-fill",
                  type: "fill",
                  source: "run-states",
                  paint: { "fill-color": "#2E5C8A", "fill-opacity": 0.18 },
                });
                map.addLayer({
                  id: "run-line",
                  type: "line",
                  source: "run-states",
                  paint: { "line-color": "#1F3A5F", "line-width": 1.5 },
                });
                for (const f of matched) extendBounds(bounds, f.geometry);
              }
            } catch {
              setFailed(true);
            }
          } else {
            // Local scope — a radius circle around the terminal.
            const radius = localRadiusMiles && localRadiusMiles > 0 ? localRadiusMiles : 100;
            const circle = circlePolygonGeoJson(domicile.lat, domicile.lng, radius);
            map.addSource("run-local", {
              type: "geojson",
              data: { type: "Feature", geometry: circle, properties: {} },
            });
            map.addLayer({
              id: "run-fill",
              type: "fill",
              source: "run-local",
              paint: { "fill-color": "#2E5C8A", "fill-opacity": 0.18 },
            });
            map.addLayer({
              id: "run-line",
              type: "line",
              source: "run-local",
              paint: { "line-color": "#1F3A5F", "line-width": 1.5 },
            });
            for (const [lng, lat] of circle.coordinates[0]) bounds.extend([lng, lat]);
          }

          // Terminal pin (brand deep).
          new maplibregl.Marker({ color: "#1F3A5F" })
            .setLngLat([domicile.lng, domicile.lat])
            .setPopup(new maplibregl.Popup({ offset: 18 }).setText(domicile.label))
            .addTo(map);
          bounds.extend([domicile.lng, domicile.lat]);

          // Driver home pin (gold), when provided.
          if (home && Number.isFinite(home.lat) && Number.isFinite(home.lng)) {
            new maplibregl.Marker({ color: "#D4A017" })
              .setLngLat([home.lng, home.lat])
              .setPopup(new maplibregl.Popup({ offset: 18 }).setText("Your home"))
              .addTo(map);
            bounds.extend([home.lng, home.lat]);
          }

          if (!bounds.isEmpty()) {
            map.fitBounds(bounds, { padding: 36, maxZoom: 8, duration: 0 });
          }
        });
      } catch {
        setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (map) map.remove();
    };
  }, [hasDomicile, domicile, running, localRadiusMiles, home]);

  if (!hasDomicile) return null;
  if (failed) {
    return (
      <p className={"text-xs text-brand-muted " + (className ?? "")}>
        Map unavailable — {domicile.label}.
      </p>
    );
  }

  return (
    <div className={className}>
      <div
        ref={containerRef}
        className="h-56 w-full overflow-hidden rounded-lg border border-brand-rule"
        aria-label={`Map of the ${domicile.label} running area`}
      />
    </div>
  );
}
