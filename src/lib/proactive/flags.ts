// Proactive-sends feature flag. Gates the SEND path of the lifelong
// advocate system. Default OFF — the triggers + governance spine compute
// and persist decisions, but no SMS/email actually goes out until A2P
// 10DLC registration is confirmed live. This is a TECHNICAL-readiness
// gate (the channel isn't live), distinct from the legal clearance; same
// build-disabled pattern as QUICKBASE_PUSH_ENABLED for the Anderson push.

export function isProactiveSendsEnabled(): boolean {
  return process.env.PROACTIVE_SENDS_ENABLED === "true";
}
