import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  output: "standalone",
  async rewrites() {
    return [];
  },
};

export default nextConfig;