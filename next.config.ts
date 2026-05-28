import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
