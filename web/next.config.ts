import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const wsShim = path.join(rootDir, "src/lib/presence/ws-shim.js");

const nextConfig: NextConfig = {
  // Photon Realtime pulls Node `ws`; browser builds use the shim below.
  serverExternalPackages: ["ws"],
  turbopack: {
    resolveAlias: {
      ws: wsShim,
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...config.resolve.alias,
        ws: wsShim,
      };
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
