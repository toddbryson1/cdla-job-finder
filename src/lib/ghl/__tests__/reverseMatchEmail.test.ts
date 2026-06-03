import { beforeAll, describe, expect, it } from "vitest";
import {
  reverseMatchEmail,
  type ReverseMatchEmailInput,
} from "@/lib/ghl/reverseMatchEmail";

const FIXTURE_DRIVER_ID = "11111111-2222-3333-4444-555555555555";

/** Builds a valid input. Each test overrides the fields it actually
 *  cares about so adding new required fields to the input shape
 *  (driverId + recipientEmail for the CAN-SPAM footer) doesn't
 *  ripple through every test. */
function input(
  overrides: Partial<ReverseMatchEmailInput> &
    Pick<ReverseMatchEmailInput, "firstName" | "newMatchCount">,
): ReverseMatchEmailInput {
  return {
    firstName: overrides.firstName,
    cdlState: overrides.cdlState ?? "GA",
    newMatchCount: overrides.newMatchCount,
    appUrl: overrides.appUrl ?? "https://www.cdla.jobs",
    driverId: overrides.driverId ?? FIXTURE_DRIVER_ID,
    recipientEmail: overrides.recipientEmail ?? "pat@example.com",
  };
}

describe("reverseMatchEmail", () => {
  beforeAll(() => {
    // Required by the unsubscribe footer renderer. Tests assert the
    // shape of the link, not the specific HMAC value, so any non-
    // empty string works.
    process.env.UNSUBSCRIBE_SECRET ??= "test-unsubscribe-secret";
  });
  it("uses singular copy for newMatchCount === 1", () => {
    const r = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 1,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r.subject).toMatch(/^New CDL-A carrier matching/);
    expect(r.subject).not.toMatch(/carriers/); // singular only
    expect(r.html).toMatch(/A carrier just joined/);
    // CTA copy is singular too.
    expect(r.html).toMatch(/See the match/);
  });

  it("uses plural copy for newMatchCount >= 2", () => {
    const r = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 3,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r.subject).toMatch(/^3 new CDL-A carriers/);
    expect(r.html).toMatch(/3 new carriers/);
    expect(r.html).toMatch(/See the matches/);
  });

  it("adds the 'noticeable jump' line only when newMatchCount >= 4", () => {
    const r3 = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 3,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r3.html).not.toMatch(/noticeable jump/);

    const r5 = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 5,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r5.html).toMatch(/noticeable jump/);
  });

  it("falls back to 'Hey there' when firstName is empty", () => {
    const r = reverseMatchEmail(input({
      firstName: "",
      cdlState: "GA",
      newMatchCount: 1,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r.html).toMatch(/Hey there/);
  });

  it("escapes HTML in firstName (defense against carrier-supplied weirdness)", () => {
    const r = reverseMatchEmail(input({
      firstName: "<script>alert(1)</script>",
      cdlState: "GA",
      newMatchCount: 1,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r.html).not.toMatch(/<script>alert/);
    expect(r.html).toMatch(/&lt;script&gt;/);
  });

  it("CTA URL points at /login?redirect=/me so the post-sign-in landing is the driver dashboard", () => {
    // Without the redirect param, an email-clicker would land on the
    // generic /matches/[driverId] (or /me default) — but with it we
    // explicitly land on /me where the alert strip can surface the
    // very same "new matches" event.
    const r = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 2,
      appUrl: "https://www.cdla.jobs",
    }));
    expect(r.html).toContain("https://www.cdla.jobs/login?redirect=%2Fme");
  });

  it("renders the region label for the cdl_state", () => {
    const r = reverseMatchEmail(input({
      firstName: "Pat",
      cdlState: "GA",
      newMatchCount: 1,
      appUrl: "https://www.cdla.jobs",
    }));
    // GA → Georgia per regions resolver. Test the resolver indirectly.
    expect(r.html.toLowerCase()).toMatch(/georgia/);
  });
});
