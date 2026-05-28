import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitToIndexNow } from "../indexnow";

describe("submitToIndexNow", () => {
  const ORIGINAL_ENV = process.env.INDEXNOW_KEY;
  const ORIGINAL_FETCH = global.fetch;

  beforeEach(() => {
    delete process.env.INDEXNOW_KEY;
  });
  afterEach(() => {
    if (ORIGINAL_ENV) process.env.INDEXNOW_KEY = ORIGINAL_ENV;
    else delete process.env.INDEXNOW_KEY;
    global.fetch = ORIGINAL_FETCH;
  });

  it("returns ok=false without calling fetch when INDEXNOW_KEY is missing", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const result = await submitToIndexNow(["https://www.cdla.jobs/articles/x"]);
    expect(result.ok).toBe(false);
    expect(result.body).toMatch(/INDEXNOW_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("POSTs the expected envelope when key is set", async () => {
    process.env.INDEXNOW_KEY = "abc123";
    const fetchSpy = vi.fn().mockResolvedValue({
      status: 200,
      text: async () => "",
    });
    global.fetch = fetchSpy as unknown as typeof global.fetch;

    const result = await submitToIndexNow([
      "https://www.cdla.jobs/articles/one",
      "https://www.cdla.jobs/articles/two",
    ]);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("https://api.indexnow.org/IndexNow");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      host: "cdla.jobs",
      key: "abc123",
      keyLocation: "https://www.cdla.jobs/abc123.txt",
      urlList: [
        "https://www.cdla.jobs/articles/one",
        "https://www.cdla.jobs/articles/two",
      ],
    });
  });

  it("accepts HTTP 202 as success", async () => {
    process.env.INDEXNOW_KEY = "abc";
    global.fetch = vi
      .fn()
      .mockResolvedValue({ status: 202, text: async () => "" }) as unknown as typeof global.fetch;
    const r = await submitToIndexNow(["https://www.cdla.jobs/x"]);
    expect(r.ok).toBe(true);
    expect(r.status).toBe(202);
  });

  it("returns ok=false on non-2xx", async () => {
    process.env.INDEXNOW_KEY = "abc";
    global.fetch = vi
      .fn()
      .mockResolvedValue({
        status: 422,
        text: async () => "key not found",
      }) as unknown as typeof global.fetch;
    const r = await submitToIndexNow(["https://www.cdla.jobs/x"]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.body).toBe("key not found");
  });

  it("returns ok=false on network error", async () => {
    process.env.INDEXNOW_KEY = "abc";
    global.fetch = vi
      .fn()
      .mockRejectedValue(new Error("DNS fail")) as unknown as typeof global.fetch;
    const r = await submitToIndexNow(["https://www.cdla.jobs/x"]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(0);
    expect(r.body).toMatch(/DNS fail/);
  });
});
