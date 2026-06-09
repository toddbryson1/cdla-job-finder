// Advisor-mode feature flag. Gates ALL driver-facing advisor behavior
// (assessment, ranked recommendations, fit-tier reasoning in the UI).
// Default OFF: when disabled the site behaves as the pre-advisor neutral
// matcher. Flip to "true" in the environment only after the advisor
// consent-scope items are confirmed cleared (see the build plan's risk
// note). Same convention as DEBBIE_AUDIO_ENABLED / QUICKBASE_PUSH_ENABLED.

export function isAdvisorModeEnabled(): boolean {
  return process.env.ADVISOR_MODE_ENABLED === "true";
}
