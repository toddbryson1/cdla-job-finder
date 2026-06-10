"use client";

import dynamic from "next/dynamic";
import type { RunningAreaMapProps } from "./RunningAreaMap";

// Client wrapper that lazy-loads the MapLibre map (and the library itself,
// ~230KB) only when this mounts. ssr:false because the map is browser-only.
// Server components (e.g. /job/[slug]) can't use dynamic(ssr:false) directly,
// so they render this client wrapper instead. The match card uses it too,
// so the lazy-load lives in exactly one place.
const RunningAreaMap = dynamic(
  () => import("./RunningAreaMap").then((m) => m.RunningAreaMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 w-full animate-pulse rounded-lg bg-brand-surface" />
    ),
  },
);

export function RunningAreaMapLazy(props: RunningAreaMapProps) {
  return <RunningAreaMap {...props} />;
}
