import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Authenticated financial pages must not be prerendered into a shared cache.
  allowedDevOrigins: ["127.0.0.1"],
  serverExternalPackages: ["sharp"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
