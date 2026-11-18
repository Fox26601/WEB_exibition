/**
 * UWAG-76 walkthrough captures for overlapping layout catalog.
 * Uses ?qa=1 camera teleports + WASD segments (Xvfb + EGL required).
 */
import { chromium } from "playwright";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLayout } from "../src/lib/catalog-types.ts";
import { syncPaintingYaws } from "../src/lib/placement-eval.ts";
import {
  layoutWalkBounds,
  layoutSpawnPoint,
  paintingPoseFromPlacement,
} from "../src/lib/gallery-three/painting-pose.ts";
import { roomWorldVertices } from "../src/lib/layout-geometry.ts";

const BASE =
  process.env.WALKTHROUGH_URL ??
  "http://127.0.0.1:3456/exhibition?qa=1";
const STORE_MEDIA =
  process.env.WALKTHROUGH_MEDIA_DIR ??
  "/cursor/stores/bc-5455966e-ece6-405c-a67a-041c24f90162/media";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  here,
  "../src/lib/gallery-three/prod-catalog.fixture.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

/** Local dev: parity walkthrough must use prod overlap layout, not empty .data catalog. */
if (!process.env.WALKTHROUGH_URL) {
  const dataDir = join(here, "../.data");
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(
    join(dataDir, "catalog-live.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
    "utf8",
  );
}

const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
const bounds = layoutWalkBounds(layout.rooms);
const spawn = bounds ? layoutSpawnPoint(layout, bounds) : { x: 0, z: 0 };

function paintingCamera(artworkId, pitchDeg = 0, distOverride) {
  const placement = layout.placements.find(
    (p) => p.kind === "painting" && p.artworkId === artworkId,
  );
  if (!placement) return null;
  const pose = paintingPoseFromPlacement(placement, layout);
  if (!pose) return null;
  const inwardX = Math.sin(pose.yawRad);
  const inwardZ = Math.cos(pose.yawRad);
  const dist = distOverride ?? 2.35;
  return {
    x: pose.position.x + inwardX * dist,
    y: 1.55,
    z: pose.position.z + inwardZ * dist,
    yawDeg: (pose.yawRad * 180) / Math.PI,
    pitchDeg,
  };
}

function overlapCornerCamera() {
  const verts = layout.rooms.flatMap((r) => roomWorldVertices(r));
  let best = { x: 0, z: 0, n: 0 };
  for (const v of verts) {
    const peers = verts.filter(
      (w) => Math.hypot(w.x - v.x, w.z - v.z) < 0.15,
    ).length;
    if (peers >= 2) {
      best.x += v.x;
      best.z += v.z;
      best.n += 1;
    }
  }
  if (best.n === 0) return { x: 0.2, y: 1.55, z: 6.5, yawDeg: 35, pitchDeg: 4 };
  const cx = best.x / best.n;
  const cz = best.z / best.n;
  return {
    x: cx - 1.6,
    y: 1.58,
    z: cz + 1.4,
    yawDeg: 38,
    pitchDeg: 3,
  };
}

if (!existsSync(STORE_MEDIA)) mkdirSync(STORE_MEDIA, { recursive: true });

const SHOTS = [
  {
    name: "uwag76-walkthrough-00-entrance.png",
    cam: { x: spawn.x, y: 1.6, z: spawn.z, yawDeg: 0, pitchDeg: 0 },
    wasd: ["KeyW", "KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-hex-corner.png",
    cam: { x: 3.05, y: 1.58, z: 2.35, yawDeg: -118, pitchDeg: -5 },
    wasd: ["KeyA", "KeyS"],
  },
  {
    name: "uwag76-walkthrough-room-hex-art.png",
    cam: paintingCamera("sample-01"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-room-triangle-doorway.png",
    cam: { x: 1.5, y: 1.58, z: 5.4, yawDeg: -22, pitchDeg: 0 },
    wasd: ["KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-triangle-corner.png",
    cam: paintingCamera("sample-02"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-overlap-floor.png",
    cam: { x: 0.55, y: 1.56, z: 5.85, yawDeg: 18, pitchDeg: -4 },
    wasd: ["KeyW", "KeyA"],
  },
  {
    name: "uwag76-walkthrough-overlap-corner-joint.png",
    cam: overlapCornerCamera(),
    wasd: ["KeyW"],
  },
  {
    name: "uwag76-walkthrough-room-square-art.png",
    cam: paintingCamera("sample-04"),
    wasd: [],
  },
  {
    name: "uwag76-walkthrough-room-triangle-art-03.png",
    cam: (() => {
      const base = paintingCamera("sample-03", 0, 2.55);
      if (!base) return { x: 2.15, y: 1.55, z: 7.4, yawDeg: 57, pitchDeg: 0 };
      return { ...base, yawDeg: (base.yawDeg + 180) % 360 };
    })(),
    wasd: [],
  },
].filter((s) => s.cam);

const browser = await chromium.launch({
  headless: false,
  args: ["--use-gl=egl", "--enable-webgl"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`${BASE}&_v=${Date.now()}`, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForSelector("canvas", { timeout: 90000 });
await page.waitForFunction(
  () => typeof window.__setGalleryCamera === "function",
  { timeout: 60000 },
);
await page.waitForTimeout(3200);

for (const step of SHOTS) {
  await page.evaluate((cam) => {
    window.__setGalleryCamera(cam);
  }, step.cam);
  for (const code of step.wasd) {
    await page.keyboard.down(code);
    await page.waitForTimeout(220);
    await page.keyboard.up(code);
  }
  await page.waitForTimeout(2200);
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