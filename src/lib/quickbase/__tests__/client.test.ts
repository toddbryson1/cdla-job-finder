import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deriveExperienceLevel,
  isQuickbaseConfigured,
  pushAndersonHandoff,
  type QuickbaseHandoffInput,
} from "../client";

// Minimal-but-typed fixture builder for pushAndersonHandoff input.
// We cast to the typed input — the runtime only reads a handful of
// fields, and the rest stay untouched.
function makeInput(
  overrides: { driver?: Record<string, unknown>; job?: Record<string, unknown> } = {},
): QuickbaseHandoffInput {
  const driver = {
    id: "00000000-0000-0000-0000-000000000001",
    firstName: "Pat",
    lastName: "Sample",
    email: "pat@example.com",
    phone: "555-555-1234",
    homeZip: "56301",
    yearsHeld: "3",
    ...(overrides.driver ?? {}),
  };
  const carrierJob = {
    id: "00000000-0000-0000-0000-000000000002",
    positionTitle: "Lease Purchase Van - OTR",
    ...(overrides.job ?? {}),
  };
  const stage = {
    id: "00000000-0000-0000-0000-000000000003",
    driverId: driver.id,
    carrierJobId: carrierJob.id,
    carrierId: "00000000-0000-0000-0000-000000000004",
    stage: "intelliapp_link_sent",
  };
  return {
    driver: driver as unknown as QuickbaseHandoffInput["driver"],
    carrierJob: carrierJob as unknown as QuickbaseHandoffInput["carrierJob"],
    stage: stage as unknown as QuickbaseHandoffInput["stage"],
    quickbaseConfig: {
      realm_hostname: "sterlingrecruitingsolutions.quickbase.com",
      app_id: "bcivf3yss",
      table_id: "bcivf3ysv",
      default_recruiter_name: "Todd Bryson",
    },
  };
}

describe("deriveExperienceLevel (spec §B10 Q3 placeholders)", () => {
  it("buckets years into the four placeholder strings", () => {
    expect(deriveExperienceLevel(0)).toBe("Less than 1 year");
    expect(deriveExperienceLevel(0.5)).toBe("Less than 1 year");
    expect(deriveExperienceLevel(1)).toBe("1-2 years");
    expect(deriveExperienceLevel(1.5)).toBe("1-2 years");
    expect(deriveExperienceLevel(2)).toBe("2-5 years");
    expect(deriveExperienceLevel(4.5)).toBe("2-5 years");
    expect(deriveExperienceLevel(5)).toBe("5+ years");
    expect(deriveExperienceLevel(25)).toBe("5+ years");
  });
});

describe("isQuickbaseConfigured (feature flag, spec §B11)", () => {
  const origToken = process.env.QUICKBASE_STERLING_API_TOKEN;
  const origFlag = process.env.QUICKBASE_PUSH_ENABLED;

  afterEach(() => {
    if (origToken === undefined) delete process.env.QUICKBASE_STERLING_API_TOKEN;
    else process.env.QUICKBASE_STERLING_API_TOKEN = origToken;
    if (origFlag === undefined) delete process.env.QUICKBASE_PUSH_ENABLED;
    else process.env.QUICKBASE_PUSH_ENABLED = origFlag;
  });

  it("is false when both env vars are absent (default state)", () => {
    delete process.env.QUICKBASE_STERLING_API_TOKEN;
    delete process.env.QUICKBASE_PUSH_ENABLED;
    expect(isQuickbaseConfigured()).toBe(false);
  });

  it("is false when token is set but flag is not 'true'", () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "fake-token";
    process.env.QUICKBASE_PUSH_ENABLED = "false";
    expect(isQuickbaseConfigured()).toBe(false);
  });

  it("is false when flag is 'true' but no token is present", () => {
    delete process.env.QUICKBASE_STERLING_API_TOKEN;
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    expect(isQuickbaseConfigured()).toBe(false);
  });

  it("is true only when token is set AND flag is exactly 'true'", () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "fake-token";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    expect(isQuickbaseConfigured()).toBe(true);
  });
});

describe("pushAndersonHandoff", () => {
  const origToken = process.env.QUICKBASE_STERLING_API_TOKEN;
  const origFlag = process.env.QUICKBASE_PUSH_ENABLED;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (origToken === undefined) delete process.env.QUICKBASE_STERLING_API_TOKEN;
    else process.env.QUICKBASE_STERLING_API_TOKEN = origToken;
    if (origFlag === undefined) delete process.env.QUICKBASE_PUSH_ENABLED;
    else process.env.QUICKBASE_PUSH_ENABLED = origFlag;
  });

  it("is a no-op when not configured (does not call fetch)", async () => {
    delete process.env.QUICKBASE_STERLING_API_TOKEN;
    delete process.env.QUICKBASE_PUSH_ENABLED;
    const spy = vi.spyOn(global, "fetch");
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("not_configured");
    expect(spy).not.toHaveBeenCalled();
  });

  it("sends the QB-USER-TOKEN auth header and realm hostname header", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ metadata: { createdRecordIds: [42] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.recordId).toBe("42");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.quickbase.com/v1/records");
    expect(init?.method).toBe("POST");
    const headers = init!.headers as Record<string, string>;
    expect(headers.Authorization).toBe("QB-USER-TOKEN secret-abc");
    expect(headers["QB-Realm-Hostname"]).toBe(
      "sterlingrecruitingsolutions.quickbase.com",
    );

    const body = JSON.parse(String(init!.body));
    expect(body.to).toBe("bcivf3ysv");
    expect(body.data[0].Company.value).toBe("Anderson");
    expect(body.data[0]["Recruiter Name"].value).toBe("Todd Bryson");
    expect(body.data[0]["Driver Applying For"].value).toBe(
      "Lease Purchase Van - OTR",
    );
    // Notes line includes the match ID (load-bearing per spec §B5.5).
    expect(body.data[0].Notes.value).toContain(
      "CDLA.jobs match ID: 00000000-0000-0000-0000-000000000003",
    );
  });

  it("returns no-retry on 4xx", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("missing required field", { status: 400 }),
    );
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("no_retry");
      expect(res.error).toContain("400");
    }
  });

  it("returns retryable on 5xx", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("upstream timeout", { status: 503 }),
    );
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("retryable");
      expect(res.error).toContain("503");
    }
  });

  it("returns auth code on 401 (alert ops per spec §B6.3)", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("token rejected", { status: 401 }),
    );
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("auth");
  });

  it("treats network error as retryable", async () => {
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("ECONNRESET"));
    const res = await pushAndersonHandoff(makeInput());
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("retryable");
      expect(res.error).toContain("ECONNRESET");
    }
  });
});
