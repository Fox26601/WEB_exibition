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
  // Safari does not decompress script/wasm URLs that end in ".gz" even when
  // Content-Encoding: gzip is set (WebKit 247421). Serve gzip bodies under
  // extension-less compressed names and point the Unity loader at those URLs.
  async rewrites() {
    return [
      {
        source: "/unity/Build/WebGL.framework.js",
        destination: "/unity/Build/WebGL.framework.js.gz",
      },
      {
        source: "/unity/Build/WebGL.wasm",
        destination: "/unity/Build/WebGL.wasm.gz",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/unity/Build/WebGL.framework.js",
        headers: [
          { key: "Content-Type", value: "application/javascript" },
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
      {
        source: "/unity/Build/WebGL.wasm",
        headers: [
          { key: "Content-Type", value: "application/wasm" },
          { key: "Content-Encoding", value: "gzip" },
          immutable,
        ],
      },
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
        // Safari: application/gzip (not octet-stream) so XHR decompresses .data.gz
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
