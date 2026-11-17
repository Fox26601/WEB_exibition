#!/usr/bin/env node
/**
 * Sanity-check committed Unity WebGL Build/* artifacts for internal consistency.
 * Does not prove wasm matches latest C# — only that loader / framework / wasm agree.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const buildDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "unity",
  "Build",
);

function fail(msg) {
  console.error(`[verify-unity-build] ${msg}`);
  process.exit(1);
}

if (!existsSync(buildDir)) {
  console.warn("[verify-unity-build] skip: no public/unity/Build");
  process.exit(0);
}

const loaderPath = path.join(buildDir, "WebGL.loader.js");
const frameworkPath = path.join(buildDir, "WebGL.framework.js");
const wasmPath = path.join(buildDir, "WebGL.wasm");
const dataPath = path.join(buildDir, "WebGL.data");

for (const p of [loaderPath, frameworkPath, wasmPath, dataPath]) {
  if (!existsSync(p)) fail(`missing ${path.basename(p)}`);
}

const loader = readFileSync(loaderPath, "utf8");
const framework = readFileSync(frameworkPath, "utf8");
const wasmBytes = readFileSync(wasmPath);
const wasmSize = statSync(wasmPath).size;

const sizeMatch = loader.match(/wasmFileSize:(\d+)/);
if (!sizeMatch) fail("WebGL.loader.js: wasmFileSize not found");
if (Number(sizeMatch[1]) !== wasmSize) {
  fail(
    `wasm size mismatch: loader wasmFileSize=${sizeMatch[1]} actual=${wasmSize}`,
  );
}

if (!/(?:var|let|const)\s+unityFramework\s*=/.test(framework)) {
  fail("WebGL.framework.js: unityFramework export missing");
}

if (!loader.includes("createUnityInstance")) {
  fail("WebGL.loader.js: createUnityInstance missing");
}

const dataBuf = readFileSync(dataPath);
const dataHead = String.fromCharCode(...dataBuf.subarray(0, 20));
if (!dataHead.startsWith("UnityWebData1.0")) {
  fail("WebGL.data: UnityWebData header missing (wrong or corrupt file)");
}

let imports;
try {
  imports = WebAssembly.Module.imports(new WebAssembly.Module(wasmBytes));
} catch (e) {
  fail(`WebGL.wasm: invalid module (${e.message})`);
}

const wantsUncaught = imports.some(
  (i) => i.module === "env" && i.name === "__cxa_uncaught_exceptions",
);
const fwProvidesUncaught = framework.includes("__cxa_uncaught_exceptions");
if (wantsUncaught !== fwProvidesUncaught) {
  fail(
    wantsUncaught
      ? "wasm imports env.__cxa_uncaught_exceptions but framework.js does not define it (mixed Unity export?)"
      : "framework references __cxa_uncaught_exceptions but wasm does not import it (mixed Unity export?)",
  );
}

console.log(
  `[verify-unity-build] OK loader/framework/wasm/data consistent (wasm ${wasmSize} bytes)`,
);