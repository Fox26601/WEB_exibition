import type { NextConfig } from "next";

const immutable = {
  key: "Cache-Control",
  value: "public, max-age=31536000, immutable",
} as const;

const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/unity/:path*.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.data",
        headers: [
          { key: "Content-Type", value: "application/octet-stream" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.js",
        headers: [immutable],
      },
      {
        source: "/unity/:path*.br",
        headers: [
          { key: "Content-Encoding", value: "br" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.wasm.gz",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.data.gz",
        headers: [
          { key: "Content-Type", value: "application/gzip" },
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.js.gz",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
      {
        source: "/unity/:path*.gz",
        headers: [
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
    ];
  },
};

export default nextConfig;
