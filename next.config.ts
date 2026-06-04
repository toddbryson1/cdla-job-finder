import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // heic-convert pulls in libheif's WASM (inlined in libheif-js's
  // bundle build). Keep it out of the webpack bundle so the WASM
  // module loads via a plain node require at runtime — the route that
  // uses it (/api/debbie/parse-resume) is `runtime = "nodejs"`. This
  // is the recommended handling for large WASM-bearing packages.
  serverExternalPackages: ["heic-convert"],
  images: {
    // Allow content-machine images served from Vercel Blob.
    // Blob URLs look like https://<store>.public.blob.vercel-storage.com/...
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.public.blob.vercel-storage.com",
      },
    ],
  },
};

export default nextConfig;
