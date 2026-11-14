import { existsSync } from "fs";
import path from "path";

/** True when a Unity WebGL Build folder was copied into public/unity. */
export function unityBuildPresent(): boolean {
  const buildDir = path.join(process.cwd(), "public", "unity", "Build");
  return existsSync(buildDir);
}
