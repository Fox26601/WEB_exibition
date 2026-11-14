#!/usr/bin/env node
/**
 * Gunzip Unity WebGL Build/*.gz into sibling uncompressed files so Safari can
 * load them (WebKit does not honor Content-Encoding: gzip for these assets).
 */
import { createGunzip } from "node:zlib";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "unity",
  "Build",
);

const pairs = [
  ["WebGL.framework.js.gz", "WebGL.framework.js"],
  ["WebGL.data.gz", "WebGL.data"],
  ["WebGL.wasm.gz", "WebGL.wasm"],
];

for (const [gzName, outName] of pairs) {
  const gzPath = path.join(buildDir, gzName);
  const outPath = path.join(buildDir, outName);
  if (!existsSync(gzPath)) {
    console.warn(`[decompress-unity] skip missing ${gzName}`);
    continue;
  }
  await pipeline(createReadStream(gzPath), createGunzip(), createWriteStream(outPath));
  console.log(`[decompress-unity] ${gzName} -> ${outName}`);
}
