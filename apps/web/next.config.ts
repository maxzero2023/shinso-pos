import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  transpilePackages: ["@shinso/db", "@shinso/api"],
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shinso/db": path.resolve(__dirname, "../../packages/db/src"),
      "@shinso/api": path.resolve(__dirname, "../../packages/api/src"),
    };
    return config;
  },
};

export default nextConfig;
