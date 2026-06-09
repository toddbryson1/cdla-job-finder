import { describe, expect, it } from "vitest";
import {
  governProactiveContact,
  type ContactHistory,
} from "@/lib/proactive/governance";
import {
  evaluateMilestone,
  evaluateStayPut,
  evaluateStepUp,
} from "@/lib/proactive/triggers";
import { PROACTIVE_CONFIG } from "@/lib/proactive/config";

const NOW = new Date("2026-06-09T12:00:00Z");

function history(over: Partial<ContactHistory> = {}): ContactHistory {
  return {
    contactsInWindow: 0,
    lastContactAt: null,
    consecutiveIgnored: 0,
    unsubscribed: false,
    deleted: false,
    ...over,
  };
}

describe("governProactiveContact — the anti-spam spine", () => {
  it("allows a clean, fresh driver", () => {
    expect(governProactiveContact(history(), NOW)).toEqual({ allowed: true });
  });

  it("permanently stops a deleted or unsubscribed driver", () => {
    expect(governProactiveContact(history({ deleted: true }), NOW).suppressReason).toBe(
      "deleted",
    );
    expect(
      governProactiveContact(history({ unsubscribed: true }), NOW).suppressReason,
    ).toBe("opted_out");
  });

  it("suppresses a disengaged driver before they have to opt out", () => {
    const d = governProactiveContact(
      history({
        consecutiveIgnored: PROACTIVE_CONFIG.suppressAfterConsecutiveIgnored,
      }),
      NOW,
    );
    expect(d).toEqual({ allowed: false, suppressReason: "disengaged" });
  });

  it("enforces the frequency cap regardless of triggers", () => {
    const d = governProactiveContact(
      history({ contactsInWindow: PROACTIVE_CONFIG.maxContactsPer30Days }),
      NOW,
    );
    expect(d.suppressReason).toBe("frequency_cap");
  });

  it("enforces the cooldown after a recent contact", () => {
    const twoDaysAgo = new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000);
    expect(
      governProactiveContact(history({ lastContactAt: twoDaysAgo }), NOW).suppressReason,
    ).toBe("cooldown");
    // Past the cooldown window → allowed again.
    const longAgo = new Date(
      NOW.getTime() - (PROACTIVE_CONFIG.cooldownDays + 1) * 24 * 60 * 60 * 1000,
    );
    expect(governProactiveContact(history({ lastContactAt: longAgo }), NOW).allowed).toBe(
      true,
    );
  });
});

describe("trigger materiality gates", () => {
  it("step-up (pay-first) requires a real weekly gain", () => {
    const tooSmall = evaluateStepUp({
      topPriority: "pay",
      currentWeeklyPay: 1200,
      candidateWeeklyPay: 1230, // +$30 < threshold
      currentHomeTime: null,
      candidateHomeTime: null,
      candidateCarrierName: "X",
    });
    expect(tooSmall).toBeNull();

    const material = evaluateStepUp({
      topPriority: "pay",
      currentWeeklyPay: 1200,
      candidateWeeklyPay: 1400, // +$200
      currentHomeTime: null,
      candidateHomeTime: null,
      candidateCarrierName: "Better Pay Co",
    });
    expect(material?.triggerType).toBe("step_up");
    expect(material?.materialityDetail).toMatch(/\+\$200/);
  });

  it("step-up (home-time-first) requires a genuinely better home level", () => {
    const sameLevel = evaluateStepUp({
      topPriority: "home_time",
      currentWeeklyPay: null,
      candidateWeeklyPay: null,
      currentHomeTime: "weekly",
      candidateHomeTime: "weekly",
      candidateCarrierName: "X",
    });
    expect(sameLevel).toBeNull();

    const better = evaluateStepUp({
      topPriority: "home_time",
      currentWeeklyPay: null,
      candidateWeeklyPay: null,
      currentHomeTime: "weekly",
      candidateHomeTime: "daily",
      candidateCarrierName: "Home Daily Co",
    });
    expect(better?.triggerType).toBe("step_up");
  });

  it("stay-put fires only when nothing beats the current job", () => {
    expect(
      evaluateStayPut({ driverAskedForBetter: true, bestAvailableBeatsCurrent: false })
        ?.triggerType,
    ).toBe("stay_put");
    expect(
      evaluateStayPut({ driverAskedForBetter: true, bestAvailableBeatsCurrent: true }),
    ).toBeNull();
  });

  it("milestone fires only within the near-tier window", () => {
    expect(evaluateMilestone({ experienceMonths: 11 })?.triggerType).toBe("milestone");
    expect(evaluateMilestone({ experienceMonths: 6 })).toBeNull(); // not near a boundary
  });
});
