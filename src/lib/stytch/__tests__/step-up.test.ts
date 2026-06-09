import { describe, expect, it } from "vitest";
import { maskPhone, toE164US } from "@/lib/stytch/step-up";

describe("toE164US", () => {
  it("normalizes 10-digit US numbers", () => {
    expect(toE164US("512-555-1234")).toBe("+15125551234");
    expect(toE164US("(512) 555 1234")).toBe("+15125551234");
    expect(toE164US("5125551234")).toBe("+15125551234");
  });

  it("normalizes 11-digit numbers with a leading 1", () => {
    expect(toE164US("1-512-555-1234")).toBe("+15125551234");
    expect(toE164US("+1 512 555 1234")).toBe("+15125551234");
  });

  it("rejects junk and wrong-length input", () => {
    expect(toE164US(null)).toBeNull();
    expect(toE164US(undefined)).toBeNull();
    expect(toE164US("")).toBeNull();
    expect(toE164US("555-1234")).toBeNull(); // 7 digits
    expect(toE164US("212555123")).toBeNull(); // 9 digits
    expect(toE164US("25125551234")).toBeNull(); // 11 digits not starting with 1
  });
});

describe("maskPhone", () => {
  it("shows only the last 4 digits", () => {
    expect(maskPhone("+15125551234")).toBe("•••-•••-1234");
  });
});
