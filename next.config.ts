import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  serverExternalPackages: [
    "fastify",
    "@fastify/multipart",
    "@fastify/static",
    "swagger-ui-dist",
    "@libsql/client",
    "pg",
    "bcryptjs",
  ],
  outputFileTracingIncludes: {
    "/app/docs/**": [
      "./node_modules/swagger-ui-dist/swagger-ui.css",
      "./node_modules/swagger-ui-dist/swagger-ui-bundle.js",
      "./node_modules/swagger-ui-dist/swagger-ui-standalone-preset.js",
      "./node_modules/swagger-ui-dist/favicon-32x32.png",
    ],
    "/app/**": [
      "./src/data/blueshield-ca-2026q4.json",
      "./src/data/ca-rating-regions.json",
      "./examples/northwind-census.csv",
    ],
  },
};

export default nextConfig;
