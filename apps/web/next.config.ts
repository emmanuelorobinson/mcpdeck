import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@mcpdeck/shared"],
  reactStrictMode: true,
  devIndicators: false,
};

export default nextConfig;
