// The anti-spam governance spine — the part that makes or breaks the
// lifelong relationship. Pure decision logic so it's exhaustively
// testable BEFORE any send path is enabled (spec §3, §6 build order).
//
// The spine errs, every time, toward sending LESS. Restraint IS the
// product: one spammy blast undoes a year of honest behavior.

import { PROACTIVE_CONFIG } from "./config";

export type SuppressReason =
  | "opted_out"
  | "deleted"
  | "disengaged"
  | "frequency_cap"
  | "cooldown";

export interface ContactHistory {
  /** Proactive contacts already sent in the rolling window. */
  contactsInWindow: number;
  /** When the most recent proactive contact went out (null = none ever). */
  lastContactAt: Date | null;
  /** Consecutive proactive contacts the driver did not engage with. */
  consecutiveIgnored: number;
  /** Driver has unsubscribed / sent STOP (permanent). */
  unsubscribed: boolean;
  /** Driver row is CCPA-deleted. */
  deleted: boolean;
}

export interface GovernanceDecision {
  allowed: boolean;
  suppressReason?: SuppressReason;
}

/**
 * Decide whether ANY proactive contact may fire for a driver right now.
 * Checks run hardest-stop first. A driver who fails any gate is suppressed
 * with the specific reason (logged on the contact row).
 */
export function governProactiveContact(
  history: ContactHistory,
  now: Date,
): GovernanceDecision {
  // Permanent stops first — opt-out and deletion are absolute.
  if (history.deleted) return { allowed: false, suppressReason: "deleted" };
  if (history.unsubscribed) return { allowed: false, suppressReason: "opted_out" };

  // Disengagement suppression — read silence as "lower the volume".
  if (
    history.consecutiveIgnored >= PROACTIVE_CONFIG.suppressAfterConsecutiveIgnored
  ) {
    return { allowed: false, suppressReason: "disengaged" };
  }

  // Frequency cap — hard ceiling per window regardless of trigger count.
  if (history.contactsInWindow >= PROACTIVE_CONFIG.maxContactsPer30Days) {
    return { allowed: false, suppressReason: "frequency_cap" };
  }

  // Cooldown — quiet period after the last contact.
  if (history.lastContactAt) {
    const elapsedDays =
      (now.getTime() - history.lastContactAt.getTime()) / (1000 * 60 * 60 * 24);
    if (elapsedDays < PROACTIVE_CONFIG.cooldownDays) {
      return { allowed: false, suppressReason: "cooldown" };
    }
  }

  return { allowed: true };
}
