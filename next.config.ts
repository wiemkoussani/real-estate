import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: { unoptimized: true },
  experimental: {
    serverActions: { bodySizeLimit: "64mb" },
  },
  async redirects() {
    return [{ source: "/", destination: "/c/villas-ajyad", permanent: false }];
  },
};

export default nextConfig;
