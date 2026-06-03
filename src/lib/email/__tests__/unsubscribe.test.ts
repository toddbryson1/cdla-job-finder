import { beforeAll, describe, expect, it } from "vitest";
import {
  deriveUnsubscribeToken,
  renderUnsubscribeFooter,
  verifyUnsubscribeToken,
} from "@/lib/email/unsubscribe";

const DRIVER_A = "aaaaaaaa-1111-2222-3333-444444444444";
const DRIVER_B = "bbbbbbbb-1111-2222-3333-444444444444";

describe("deriveUnsubscribeToken + verifyUnsubscribeToken", () => {
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET ??= "test-unsubscribe-secret";
  });

  it("is deterministic for a given (driverId, secret) pair", () => {
    expect(deriveUnsubscribeToken(DRIVER_A)).toBe(
      deriveUnsubscribeToken(DRIVER_A),
    );
  });

  it("produces different tokens for different driver IDs", () => {
    expect(deriveUnsubscribeToken(DRIVER_A)).not.toBe(
      deriveUnsubscribeToken(DRIVER_B),
    );
  });

  it("verifyUnsubscribeToken accepts the matching token", () => {
    const tok = deriveUnsubscribeToken(DRIVER_A);
    expect(verifyUnsubscribeToken(DRIVER_A, tok)).toBe(true);
  });

  it("verifyUnsubscribeToken rejects the wrong token for the driver", () => {
    const wrongTok = deriveUnsubscribeToken(DRIVER_B);
    expect(verifyUnsubscribeToken(DRIVER_A, wrongTok)).toBe(false);
  });

  it("verifyUnsubscribeToken rejects empty inputs", () => {
    expect(verifyUnsubscribeToken("", "anything")).toBe(false);
    expect(verifyUnsubscribeToken(DRIVER_A, "")).toBe(false);
  });

  it("token rotation: changing UNSUBSCRIBE_SECRET invalidates old tokens", () => {
    const tok = deriveUnsubscribeToken(DRIVER_A);
    const orig = process.env.UNSUBSCRIBE_SECRET;
    process.env.UNSUBSCRIBE_SECRET = "different-secret";
    try {
      expect(verifyUnsubscribeToken(DRIVER_A, tok)).toBe(false);
    } finally {
      process.env.UNSUBSCRIBE_SECRET = orig;
    }
  });

  it("throws when UNSUBSCRIBE_SECRET is unset — refuse to render emails with broken unsubscribes", () => {
    const orig = process.env.UNSUBSCRIBE_SECRET;
    delete process.env.UNSUBSCRIBE_SECRET;
    try {
      expect(() => deriveUnsubscribeToken(DRIVER_A)).toThrow();
    } finally {
      process.env.UNSUBSCRIBE_SECRET = orig;
    }
  });
});

describe("renderUnsubscribeFooter", () => {
  beforeAll(() => {
    process.env.UNSUBSCRIBE_SECRET ??= "test-unsubscribe-secret";
  });

  it("includes the driver-specific unsubscribe link with the right token", () => {
    const html = renderUnsubscribeFooter({
      driverId: DRIVER_A,
      appUrl: "https://www.cdla.jobs",
      email: "pat@example.com",
    });
    const tok = deriveUnsubscribeToken(DRIVER_A);
    expect(html).toContain(
      `https://www.cdla.jobs/unsubscribe?did=${encodeURIComponent(DRIVER_A)}&t=${encodeURIComponent(tok)}`,
    );
  });

  it("escapes the recipient email + transparency text references it", () => {
    const html = renderUnsubscribeFooter({
      driverId: DRIVER_A,
      appUrl: "https://www.cdla.jobs",
      email: "<bad>@example.com",
    });
    expect(html).not.toContain("<bad>@example.com");
    expect(html).toContain("&lt;bad&gt;@example.com");
  });

  it("surfaces a loud placeholder when CDLA_SENDER_ADDRESS isn't set (so it can't ship silently)", () => {
    const orig = process.env.CDLA_SENDER_ADDRESS;
    delete process.env.CDLA_SENDER_ADDRESS;
    try {
      const html = renderUnsubscribeFooter({
        driverId: DRIVER_A,
        appUrl: "https://www.cdla.jobs",
        email: "pat@example.com",
      });
      expect(html).toContain("SENDER_ADDRESS_NOT_SET");
    } finally {
      if (orig !== undefined) process.env.CDLA_SENDER_ADDRESS = orig;
    }
  });

  it("renders the CDLA_SENDER_ADDRESS value when set", () => {
    const orig = process.env.CDLA_SENDER_ADDRESS;
    process.env.CDLA_SENDER_ADDRESS = "PHTP · 123 Main St, Anywhere, TN 38001";
    try {
      const html = renderUnsubscribeFooter({
        driverId: DRIVER_A,
        appUrl: "https://www.cdla.jobs",
        email: "pat@example.com",
      });
      expect(html).toContain("123 Main St, Anywhere, TN 38001");
    } finally {
      if (orig === undefined) {
        delete process.env.CDLA_SENDER_ADDRESS;
      } else {
        process.env.CDLA_SENDER_ADDRESS = orig;
      }
    }
  });
});
