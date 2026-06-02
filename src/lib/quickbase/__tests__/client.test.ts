import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  deriveExperienceLevel,
  isQuickbaseConfigured,
  pushAndersonHandoff,
  validateAndersonQuickbaseConfig,
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
    addressStreet: "123 Main St",
    addressCity: "St. Cloud",
    addressState: "MN",
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

describe("validateAndersonQuickbaseConfig", () => {
  // This validator is the single source of truth for "is this carrier
  // wired up for the anderson_quickbase handoff?" — referenced by the
  // retry sweeper, the inline result-page handler, and the admin drift
  // card. The codes are stable: the admin card groups by them.

  const validCfg = {
    handoff_type: "anderson_quickbase",
    quickbase: {
      realm_hostname: "sterlingrecruitingsolutions.quickbase.com",
      app_id: "bcivf3yss",
      table_id: "bcivf3ysv",
      default_recruiter_name: "Todd Bryson",
    },
  };

  it("accepts a fully-populated anderson_quickbase config", () => {
    const v = validateAndersonQuickbaseConfig(validCfg);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.config.quickbase.realm_hostname).toBe(
        "sterlingrecruitingsolutions.quickbase.com",
      );
      expect(v.config.quickbase.default_recruiter_name).toBe("Todd Bryson");
    }
  });

  it("accepts a config without default_recruiter_name (optional)", () => {
    const cfg = {
      handoff_type: "anderson_quickbase",
      quickbase: {
        realm_hostname: "x.quickbase.com",
        app_id: "a",
        table_id: "t",
      },
    };
    const v = validateAndersonQuickbaseConfig(cfg);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.config.quickbase.default_recruiter_name).toBeUndefined();
    }
  });

  it.each([null, undefined, "", 42, true, []])(
    "returns missing_config for non-object input: %p",
    (input) => {
      const v = validateAndersonQuickbaseConfig(input);
      expect(v.ok).toBe(false);
      if (!v.ok) {
        // Array is `typeof === "object"`, so it doesn't hit
        // missing_config — it falls through to wrong_handoff_type
        // because the array has no handoff_type field. That's fine;
        // the operator still sees actionable signal.
        expect([
          "missing_config",
          "wrong_handoff_type",
        ]).toContain(v.code);
      }
    },
  );

  it("returns wrong_handoff_type when handoff_type is missing or different", () => {
    const v1 = validateAndersonQuickbaseConfig({});
    expect(v1.ok).toBe(false);
    if (!v1.ok) expect(v1.code).toBe("wrong_handoff_type");

    const v2 = validateAndersonQuickbaseConfig({ handoff_type: "tenstreet_only" });
    expect(v2.ok).toBe(false);
    if (!v2.ok) expect(v2.code).toBe("wrong_handoff_type");
  });

  it("returns missing_quickbase_block when handoff_type is right but no qb sub-object", () => {
    const v = validateAndersonQuickbaseConfig({
      handoff_type: "anderson_quickbase",
    });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.code).toBe("missing_quickbase_block");
  });

  it("returns missing_quickbase_field when realm_hostname is missing", () => {
    const v = validateAndersonQuickbaseConfig({
      handoff_type: "anderson_quickbase",
      quickbase: { app_id: "a", table_id: "t" },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("missing_quickbase_field");
      expect(v.reason).toMatch(/realm_hostname/);
    }
  });

  it("returns missing_quickbase_field when app_id is empty string", () => {
    const v = validateAndersonQuickbaseConfig({
      handoff_type: "anderson_quickbase",
      quickbase: { realm_hostname: "x.quickbase.com", app_id: "", table_id: "t" },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("missing_quickbase_field");
      expect(v.reason).toMatch(/app_id/);
    }
  });

  it("returns missing_quickbase_field when table_id is wrong type", () => {
    const v = validateAndersonQuickbaseConfig({
      handoff_type: "anderson_quickbase",
      quickbase: { realm_hostname: "x.quickbase.com", app_id: "a", table_id: 42 },
    });
    expect(v.ok).toBe(false);
    if (!v.ok) {
      expect(v.code).toBe("missing_quickbase_field");
      expect(v.reason).toMatch(/table_id/);
    }
  });

  // Wire-format compatibility — these are the exact strings the retry
  // sweeper has been writing to quickbase_last_error since 0027.
  // Don't change them lightly; the admin drift card looks for them
  // historically.
  it("reason strings match the historical sweeper error messages", () => {
    const nullCfg = validateAndersonQuickbaseConfig(null);
    if (!nullCfg.ok) {
      expect(nullCfg.reason).toBe("Carrier has no partner_handoff_config");
    }
    const wrongType = validateAndersonQuickbaseConfig({ handoff_type: "x" });
    if (!wrongType.ok) {
      expect(wrongType.reason).toBe(
        "Carrier handoff config no longer routes to anderson_quickbase",
      );
    }
    const noQb = validateAndersonQuickbaseConfig({
      handoff_type: "anderson_quickbase",
    });
    if (!noQb.ok) {
      expect(noQb.reason).toBe("Carrier quickbase config malformed");
    }
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
    // Address fields per spec §B5.4 — closed by migration 0026 +
    // IdentityCaptureForm. Pin so a future regression that drops the
    // wiring back to empty strings gets caught.
    expect(body.data[0].Street.value).toBe("123 Main St");
    expect(body.data[0].City.value).toBe("St. Cloud");
    expect(body.data[0].State.value).toBe("MN");
    expect(body.data[0].Zip.value).toBe("56301");
  });

  it("legacy driver with NULL address still sends empty strings (back-compat)", async () => {
    // Drivers who completed intake before migration 0026 shipped don't
    // have addressStreet/City/State on their row. The QB payload
    // tolerates that with empty strings — Sterling's table accepts
    // them; the handoff handler doesn't gate on address. Pinned so
    // we don't accidentally make those fields required later.
    process.env.QUICKBASE_STERLING_API_TOKEN = "secret-abc";
    process.env.QUICKBASE_PUSH_ENABLED = "true";
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({ metadata: { createdRecordIds: [42] } }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const res = await pushAndersonHandoff(
      makeInput({
        driver: { addressStreet: null, addressCity: null, addressState: null },
      }),
    );
    expect(res.ok).toBe(true);
    const init = fetchMock.mock.calls[0]![1]!;
    const body = JSON.parse(String(init.body));
    expect(body.data[0].Street.value).toBe("");
    expect(body.data[0].City.value).toBe("");
    expect(body.data[0].State.value).toBe("");
    // Zip still flows from home_zip — that one's been on the row
    // since the original schema and isn't part of the migration 0026
    // back-compat surface.
    expect(body.data[0].Zip.value).toBe("56301");
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
