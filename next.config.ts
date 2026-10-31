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
    "pdfkit",
    "light-my-request",
    "cookie",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
        ],
      },
    ];
  },
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
      "./src/data/ca-small-group-catalog.json",
      "./assets/fonts/*.ttf",
    ],
  },
};

export default nextConfig;
