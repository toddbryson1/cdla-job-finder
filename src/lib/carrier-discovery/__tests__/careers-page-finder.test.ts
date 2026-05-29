import { describe, expect, it } from "vitest";
import {
  findCareersLinkInHtml,
  findCareersPage,
} from "@/lib/carrier-discovery/careers-page-finder";

describe("findCareersLinkInHtml", () => {
  const base = new URL("https://carrier.example/");

  it("matches a link by visible text", () => {
    const html = `<a href="/about-us">Careers</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m).not.toBeNull();
    expect(m!.url).toBe("https://carrier.example/about-us");
  });

  it("matches a link by href pattern", () => {
    const html = `<a href="/work-with-us/careers">Click here</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m).not.toBeNull();
    expect(m!.url).toBe("https://carrier.example/work-with-us/careers");
  });

  it("matches 'Drive for us' text", () => {
    const html = `<a href="/opportunities">Drive for us</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m).not.toBeNull();
  });

  it("matches 'CDL Jobs' text", () => {
    const html = `<a href="/openings">CDL Jobs</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m).not.toBeNull();
  });

  it("resolves relative URLs against base", () => {
    const html = `<a href="careers">Careers</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m!.url).toBe("https://carrier.example/careers");
  });

  it("returns null when no relevant link", () => {
    const html = `<a href="/about">About</a><a href="/contact">Contact</a>`;
    expect(findCareersLinkInHtml(html, base)).toBeNull();
  });

  it("skips javascript: and # anchors", () => {
    const html = `
      <a href="#careers">Careers</a>
      <a href="javascript:void(0)">Jobs</a>
      <a href="/careers-real">Careers</a>`;
    const m = findCareersLinkInHtml(html, base);
    expect(m!.url).toBe("https://carrier.example/careers-real");
  });
});

describe("findCareersPage — conventional-path probes", () => {
  it("returns the first conventional path that 200s", async () => {
    const seen: string[] = [];
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      seen.push(url);
      if (url.endsWith("/careers")) {
        return new Response("ok", { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const out = await findCareersPage("https://carrier.example/", {
      fetchImpl: fakeFetch,
    });
    expect(out).toEqual({
      url: "https://carrier.example/careers",
      source: "conventional_path",
      hint: "/careers",
    });
    expect(seen[0]).toBe("https://carrier.example/careers");
  });

  it("falls back to homepage-link scan when no conventional path hits", async () => {
    const homepageHtml = `
      <html><body>
        <nav><a href="/work-here">Drive for us</a></nav>
      </body></html>`;
    const fakeFetch: typeof fetch = async (input) => {
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (url === "https://carrier.example/") {
        return new Response(homepageHtml, { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };
    const out = await findCareersPage("https://carrier.example/", {
      fetchImpl: fakeFetch,
    });
    expect(out!.source).toBe("homepage_link");
    expect(out!.url).toBe("https://carrier.example/work-here");
  });

  it("returns null when nothing is found", async () => {
    const fakeFetch: typeof fetch = async () =>
      new Response("not found", { status: 404 });
    const out = await findCareersPage("https://carrier.example/", {
      fetchImpl: fakeFetch,
    });
    expect(out).toBeNull();
  });

  it("returns null on garbage URL input", async () => {
    const out = await findCareersPage("not a url");
    expect(out).toBeNull();
  });

  it("retries with GET when probe returns 405 Method Not Allowed", async () => {
    let headCount = 0;
    let getCount = 0;
    const fakeFetch: typeof fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      const url = typeof input === "string" ? input : (input as URL).toString();
      if (method === "HEAD" && url.endsWith("/careers")) {
        headCount++;
        return new Response("", { status: 405 });
      }
      if (method === "GET" && url.endsWith("/careers")) {
        getCount++;
        return new Response("ok", { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    const out = await findCareersPage("https://carrier.example/", {
      fetchImpl: fakeFetch,
    });
    expect(headCount).toBeGreaterThanOrEqual(1);
    expect(getCount).toBe(1);
    expect(out!.url).toBe("https://carrier.example/careers");
  });
});
