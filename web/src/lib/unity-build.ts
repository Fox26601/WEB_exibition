import { existsSync } from "fs";
import path from "path";

/** Cache-bust tag for Unity assets under /public/unity (match index.html ?v=). */
export const UNITY_ASSET_CACHE_TAG = "024";

export const UNITY_PRODUCT_VERSION = "0.2.4-admin-build";

/** True when a Unity WebGL Build folder was copied into public/unity. */
export function unityBuildPresent(): boolean {
  const buildDir = path.join(process.cwd(), "public", "unity", "Build");
  return existsSync(buildDir);
}
