import type { MetadataRoute } from "next";

// robots.txt — allow crawling of public marketing + job pages, disallow
// driver-private surfaces (intake confirmation, match pages, application
// flows, auth callbacks, API).
//
// /api/* is non-cacheable per-request data. Everything under /matches,
// /match, /intake/done is keyed by driverId and would expose PII if
// indexed. Crawlers should also stay out of /authenticate (Stytch
// magic-link landing).

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: [
          "/api/",
          "/authenticate",
          "/intake/done",
          "/match/",
          "/matches/",
          "/login",
          "/dev/",
        ],
      },
    ],
    sitemap: "https://cdla.jobs/sitemap.xml",
    host: "https://cdla.jobs",
  };
}
