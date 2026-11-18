/**
 * UWAG-76 walkthrough captures for overlapping layout catalog.
 * Uses ?qa=1 camera teleports + WASD segments (Xvfb + EGL required).
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { normalizeLayout } from "../src/lib/catalog-types.ts";
import { syncPaintingYaws } from "../src/lib/placement-eval.ts";
import {
  layoutWalkBounds,
  layoutSpawnPoint,
  paintingPoseFromPlacement,
} from "../src/lib/gallery-three/painting-pose.ts";

const BASE =
  process.env.WALKTHROUGH_URL ??
  "http://127.0.0.1:3456/exhibition?qa=1";
const STORE_MEDIA =
  process.env.WALKTHROUGH_MEDIA_DIR ??
  "/cursor/stores/bc-5455966e-ece6-405c-a67a-041c24f90162/media";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "../src/lib/gallery-three/prod-catalog.fixture.json"), "utf8"),
);
const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
const bounds = layoutWalkBounds(layout.rooms);
const spawn = bounds ? layoutSpawnPoint(layout, bounds) : { x: 0, z: 0 };

const paintingCameras = layout.placements
  .filter((p) => p.kind === "painting")
  .map((p) => {
    const pose = paintingPoseFromPlacement(p, layout);
    if (!pose) return null;
    const inwardX = Math.sin(pose.yawRad);
    const inwardZ = Math.cos(pose.yawRad);
    const dist = 1.65;
    return {
      id: p.artworkId,
      x: pose.position.x + inwardX * dist,
      y: 1.55,
      z: pose.position.z + inwardZ * dist,
      yawDeg: (pose.yawRad * 180) / Math.PI + 180,
      pitchDeg: 0,
    };
  })
  .filter(Boolean);

if (!existsSync(STORE_MEDIA)) mkdirSync(STORE_MEDIA, { recursive: true });

const SHOTS = [
  {
    name: "uwag76-walkthrough-00-entrance.png",
    cam: {
      x: spawn.x,
      y: 1.6,
      z: spawn.z,
      yawDeg: 0,
      pitchDeg: 0,
    },
    wasd: ["KeyW", "KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-hex-corner.png",
    cam: { x: -2.4, y: 1.55, z: 2.8, yawDeg: 55, pitchDeg: -2 },
    wasd: ["KeyW", "KeyD", "KeyA"],
  },
  {
    name: "uwag76-walkthrough-room-hex-art.png",
    cam: paintingCameras.find((c) => c.id === "sample-01"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-room-triangle-doorway.png",
    cam: { x: 0.5, y: 1.6, z: 6, yawDeg: -15, pitchDeg: 0 },
    wasd: ["KeyW", "KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-triangle-corner.png",
    cam: paintingCameras.find((c) => c.id === "sample-02"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-overlap-floor.png",
    cam: { x: 0.4, y: 1.55, z: 6.2, yawDeg: -40, pitchDeg: -5 },
    wasd: ["KeyW", "KeyW", "KeyD"],
  },
  {
    name: "uwag76-walkthrough-overlap-corner-joint.png",
    cam: { x: -1.8, y: 1.5, z: 6.5, yawDeg: 70, pitchDeg: 2 },
    wasd: ["KeyA", "KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-square-art.png",
    cam: paintingCameras.find((c) => c.id === "sample-04"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-room-triangle-art-03.png",
    cam: paintingCameras.find((c) => c.id === "sample-03"),
    wasd: [],
  },
].filter((s) => s.cam);

const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=egl", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForSelector("canvas", { timeout: 90000 });
await page.waitForFunction(
  () => {
    const w = window;
    return typeof w.__setGalleryCamera === "function";
  },
  { timeout: 60000 },
);
await page.waitForTimeout(2800);

for (const step of SHOTS) {
  await page.evaluate((cam) => {
    window.__setGalleryCamera(cam);
  }, step.cam);
  for (const code of step.wasd) {
    await page.keyboard.down(code);
    await page.waitForTimeout(220);
    await page.keyboard.up(code);
  }
  await page.waitForTimeout(900);
  await page.screenshot({
    path: join(STORE_MEDIA, step.name),
    fullPage: false,
  });
  console.log("saved", step.name);
}

await browser.close();
console.log(
  JSON.stringify({ ok: true, mediaDir: STORE_MEDIA, count: SHOTS.length }),
);