// Proactive-contact governance config — the dials that decide whether
// Debbie feels like an advocate or a pest. These are code constants
// (ops-tunable, NEVER improvised by a model) per
// SPEC_debbie-lifelong-advocate-system-v1.md §3. Start conservative:
// better to miss a marginal opportunity than to become noise.

export const PROACTIVE_CONFIG = {
  // Hard ceiling on proactive contacts per driver in a rolling window,
  // regardless of how many triggers fire.
  maxContactsPer30Days: 2,
  windowDays: 30,

  // Quiet period after any proactive contact before another may fire.
  cooldownDays: 7,

  // After this many consecutive un-engaged proactive contacts, the
  // system throttles the driver down automatically (reads silence as
  // "lower the volume", not "send more") before they have to opt out.
  suppressAfterConsecutiveIgnored: 3,

  // Materiality — a step-up must clear a REAL bar, not a $20/wk wiggle.
  stepUp: {
    // Pay-first drivers: minimum weekly pay gain to be worth a ping.
    minWeeklyPayGainUsd: 75,
  },

  // Milestone check-ins: how close (in months) a driver must be to an
  // experience tier boundary to warrant a heads-up.
  milestone: {
    nearTierWindowMonths: 1,
    tierBoundariesMonths: [12, 24],
  },
} as const;
