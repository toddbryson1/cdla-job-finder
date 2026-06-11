"use client";

// Floating "Ask Debbie" launcher — keeps Debbie reachable deeper in the
// funnel (the application steps) where she'd otherwise disappear once the
// driver leaves the matches list. Wraps the same per-job AskDebbie panel
// and /api/debbie/ask used on the matches page, so the driver gets the
// same straight-talking advisor about the exact carrier they're applying
// to: pay, lanes, home time, "is this a smart move for me."
//
// Renders a fixed pill button; opening it mounts the existing AskDebbie
// modal. The button hides while the modal is open (the modal is a
// full-screen overlay) and reappears on close.

import { useState } from "react";
import { AskDebbie } from "./AskDebbie";

interface Props {
  driverId: string;
  jobId: string;
  carrierName: string;
  positionTitle: string;
}

export function AskDebbieLauncher({
  driverId,
  jobId,
  carrierName,
  positionTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Ask Debbie about ${carrierName}`}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2.5 rounded-full bg-brand-deep py-3 pl-3 pr-5 text-sm font-semibold text-brand-paper shadow-lg transition-colors hover:bg-brand-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-gold"
        >
          <span
            aria-hidden="true"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold font-display text-sm font-semibold text-brand-ink"
          >
            D
          </span>
          Ask Debbie
        </button>
      ) : null}
      <AskDebbie
        driverId={driverId}
        jobId={jobId}
        carrierName={carrierName}
        positionTitle={positionTitle}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
