/**
 * Sanity-check checked-in Unity WebGL Build/ artifacts match each other.
 * Run: node web/scripts/verify-unity-build.mjs
 */
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = join(dirname(fileURLToPath(import.meta.url)), "../public/unity/Build");
const wasm = readFileSync(join(dir, "WebGL.wasm"));
const loader = readFileSync(join(dir, "WebGL.loader.js"), "utf8");
const framework = readFileSync(join(dir, "WebGL.framework.js"), "utf8");

const m = loader.match(/wasmFileSize:(\d+)/);
assert.ok(m, "loader must embed wasmFileSize");
assert.equal(
  Number(m[1]),
  wasm.length,
  `wasm size mismatch: loader says ${m[1]}, file is ${wasm.length}`,
);

assert.ok(
  framework.includes("unityFramework"),
  "framework.js must export unityFramework",
);
assert.ok(
  loader.includes("createUnityInstance"),
  "loader.js must define createUnityInstance",
);

for (const name of ["WebGL.data", "WebGL.wasm", "WebGL.loader.js", "WebGL.framework.js"]) {
  const st = statSync(join(dir, name));
  assert.ok(st.size > 0, `${name} is empty`);
}

console.log("Unity Build artifacts OK — wasm", wasm.length, "bytes");