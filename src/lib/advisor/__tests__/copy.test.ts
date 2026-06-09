import { describe, expect, it } from "vitest";
import {
  BANNED_PHRASES,
  OUTSIDE_JOB_CAVEAT,
  meetsRequirements,
  payPhrase,
  rulesDontFit,
} from "@/lib/advisor/copy";

// Guardrail copy must never guarantee pay, predict a hire, or use
// adverse-action language. These pin every phrase builder against the
// banned list.

function assertClean(s: string) {
  const lower = s.toLowerCase();
  for (const banned of BANNED_PHRASES) {
    expect(lower).not.toContain(banned);
  }
}

describe("advisor guardrail copy", () => {
  it("payPhrase always ranges + says confirm, never guarantees", () => {
    const ranged = payPhrase(1200, 1800);
    expect(ranged).toMatch(/approximately/i);
    expect(ranged).toMatch(/confirm/i);
    assertClean(ranged);

    const single = payPhrase(null, 1500);
    expect(single).toMatch(/confirm/i);
    assertClean(single);

    const unknown = payPhrase(null, null);
    expect(unknown).toMatch(/isn'?t posted|not posted/i);
    assertClean(unknown);
  });

  it("rulesDontFit frames the carrier's rules, never the person as rejected", () => {
    const s = rulesDontFit("Swift");
    expect(s).toMatch(/rules don'?t fit/i);
    assertClean(s);
  });

  it("meetsRequirements never predicts a hire", () => {
    const s = meetsRequirements("C.R. England");
    expect(s).toMatch(/hiring call is theirs|on paper/i);
    assertClean(s);
  });

  it("outside-job caveat flags unverified + not-shared", () => {
    expect(OUTSIDE_JOB_CAVEAT).toMatch(/can'?t verify/i);
    expect(OUTSIDE_JOB_CAVEAT).toMatch(/isn'?t shared|not shared/i);
    assertClean(OUTSIDE_JOB_CAVEAT);
  });
});
