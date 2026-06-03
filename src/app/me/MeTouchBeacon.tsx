"use client";

// Fire-and-forget beacon — POSTs /api/me/touched on mount so the
// driver's last_seen_at gets bumped AFTER /me renders. The page used
// the pre-bump value to compute "new since your last visit" badges,
// so this update only affects the NEXT visit's deltas.
//
// keepalive: true so the request survives if the driver immediately
// clicks a link out of /me. We don't await the response or surface
// errors — if the touch fails, the only consequence is that the
// next visit's "since" date is one stale visit older. Self-healing
// on the visit after that.

import { useEffect, useRef } from "react";

export function MeTouchBeacon() {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    void fetch("/api/me/touched", {
      method: "POST",
      keepalive: true,
    }).catch(() => {});
  }, []);
  return null;
}
