import { describe, expect, it } from "vitest";
import {
  findCareersLinkInHtml,
  findCareersPage,
  findJobBoardSubdomainLinks,
  findJobDetailLinks,
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

  it("findJobDetailLinks matches numeric /jobs/12345 pattern", () => {
    const html = `
      <a href="/jobs/558933/cdl-a-driver-grand-forks">View</a>
      <a href="/jobs/558935/cdl-a-driver-chicago">View</a>
      <a href="/jobs">Index</a>
      <a href="/about">About</a>`;
    const links = findJobDetailLinks(html, new URL("https://example.com/jobs"));
    expect(links.length).toBe(2);
    expect(links[0]).toContain("/jobs/558933/");
    expect(links[1]).toContain("/jobs/558935/");
  });

  it("findJobDetailLinks rejects the index page itself", () => {
    const html = `<a href="/jobs">jobs</a><a href="/jobs/">jobs slash</a>`;
    expect(findJobDetailLinks(html, new URL("https://example.com/jobs"))).toEqual([]);
  });

  it("findJobDetailLinks dedupes the same link", () => {
    const html = `
      <a href="/jobs/100/x">a</a>
      <a href="/jobs/100/x">b</a>`;
    expect(
      findJobDetailLinks(html, new URL("https://example.com/jobs")),
    ).toEqual(["https://example.com/jobs/100/x"]);
  });

  it("findJobDetailLinks rejects category / filter URLs", () => {
    const html = `
      <a href="/jobs/category/dedicated">Dedicated</a>
      <a href="/jobs/sort/recent">Recent</a>
      <a href="/jobs/100/real">Real one</a>`;
    const links = findJobDetailLinks(html, new URL("https://example.com/jobs"));
    expect(links.length).toBe(1);
    expect(links[0]).toContain("/jobs/100/");
  });

  it("findJobDetailLinks rejects cross-origin URLs", () => {
    const html = `
      <a href="https://elsewhere.example/jobs/123/x">cross</a>
      <a href="/jobs/456/y">same</a>`;
    const links = findJobDetailLinks(html, new URL("https://example.com/jobs"));
    expect(links).toEqual(["https://example.com/jobs/456/y"]);
  });

  it("findJobBoardSubdomainLinks picks jobs.foo.com from foo.com page", () => {
    const html = `
      <a href="https://jobs.foo.com">Open positions</a>
      <a href="/about">About</a>`;
    const out = findJobBoardSubdomainLinks(
      html,
      new URL("https://foo.com/careers"),
    );
    expect(out).toEqual(["https://jobs.foo.com/"]);
  });

  it("findJobBoardSubdomainLinks picks drivecarrier.com from carrier.com page", () => {
    const html = `<a href="https://drivecarrier.com/jobs">apply</a>`;
    const out = findJobBoardSubdomainLinks(
      html,
      new URL("https://carrier.com/"),
    );
    expect(out).toEqual(["https://drivecarrier.com/"]);
  });

  it("findJobBoardSubdomainLinks ignores same-origin links", () => {
    const html = `<a href="https://carrier.com/jobs/123">job</a>`;
    expect(
      findJobBoardSubdomainLinks(html, new URL("https://carrier.com/")),
    ).toEqual([]);
  });

  it("findJobBoardSubdomainLinks ignores unrelated cross-origin hosts", () => {
    const html = `
      <a href="https://twitter.com/share">twitter</a>
      <a href="https://google.com/maps">map</a>`;
    expect(
      findJobBoardSubdomainLinks(html, new URL("https://carrier.com/")),
    ).toEqual([]);
  });

  it("findJobDetailLinks matches /positions/12345 and /apply/12345", () => {
    const html = `
      <a href="/positions/9001">a</a>
      <a href="/apply/9002">b</a>
      <a href="/openings/9003">c</a>`;
    const links = findJobDetailLinks(html, new URL("https://example.com/"));
    expect(links.length).toBe(3);
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
