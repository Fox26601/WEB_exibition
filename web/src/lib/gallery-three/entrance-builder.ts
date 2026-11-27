import * as THREE from "three";
import type { Catalog, GalleryEntrancePose, GalleryLayout } from "@/lib/catalog-types";
import { DEFAULT_ENTRANCE_POSE, layoutIsEmpty } from "@/lib/catalog-types";
import {
  ENTRANCE_ARCH_WIDTH as LAYOUT_ARCH_WIDTH,
  ENTRANCE_DEPTH,
  ENTRANCE_WIDTH,
} from "@/lib/layout-geometry";
import {
  DOORWAY_PASSAGE_THICKNESS,
  ENTRANCE_SPAWN_FROM_BACK,
  FLOOR_THICKNESS,
  FLOOR_Y,
  GALLERY_FLOOR_RAISE,
  GALLERY_HEIGHT,
  PORTAL_LANDING_DEPTH,
  STAIR_PORTAL_GAP,
  STEP_COUNT,
  STEP_DEPTH,
  STEP_RISE,
  WALL_THICKNESS,
} from "./constants";
import {
  makeFloorMaterial,
  makeSurfaceMaterial,
  makeWallMaterial,
} from "./layout-builder";
import {
  applyTextureToMaterial,
  loadColorTexture,
} from "./texture-load";
import type { ClimbBand } from "./walk-surface";

/** World corridor depth — same as plan foyer depth (parity). */
export const ENTRANCE_WORLD_DEPTH = ENTRANCE_DEPTH;
/** Arch / stair clear — shared with layout doorway width. */
export const ENTRANCE_ARCH_WIDTH = LAYOUT_ARCH_WIDTH;
/** Arch height from foyer floor; keeps ~2.06 m clear above the raised gallery. */
export const ENTRANCE_ARCH_HEIGHT = GALLERY_FLOOR_RAISE + 2.06;
/** Portal arch depth — one step thicker than walls (hides joint seams). */
export const ENTRANCE_ARCH_THICKNESS = DOORWAY_PASSAGE_THICKNESS;
/** Plan/portal half-depth uses the same constant as the 3D corridor. */
export const ENTRANCE_SCHEMATIC_DEPTH = ENTRANCE_DEPTH;

/** Human-scale pedestal (museum table) + closed booklet on top. */
export const PEDESTAL_BASE_SIZE = [0.7, 0.92, 0.55] as const;
export const PEDESTAL_TOP_SIZE = [0.78, 0.06, 0.62] as const;
export const BOOKLET_SIZE = [0.3, 0.035, 0.4] as const;

const TRIM_COLOR = 0x59524f;
const TOP_COLOR = 0x736b61;
const BOOKLET_COLOR = 0x8c6b47;
const POSTER_COLOR = 0xbfb8ad;
const STEP_COLOR = 0x7a7e84;

export type EntrancePoseComputed = {
  portal: { x: number; z: number };
  spawn: { x: number; z: number };
  yawDeg: number;
  /** Local +Z faces into the gallery from the portal. */
  yawRad: number;
};

/** Portal / spawn placement for the foyer corridor. */
export function computeEntrancePose(
  pose: GalleryEntrancePose | null | undefined,
): EntrancePoseComputed {
  const p = pose ?? DEFAULT_ENTRANCE_POSE;
  const yawDeg = p.rotation ?? 0;
  const yawRad = (yawDeg * Math.PI) / 180;
  const halfSchematic = ENTRANCE_SCHEMATIC_DEPTH * 0.5;
  const portal = {
    x: p.x - halfSchematic * Math.sin(yawRad),
    z: p.z + halfSchematic * Math.cos(yawRad),
  };
  // Local +Z into gallery; corridor extends toward local −Z.
  const intoCorridorX = -Math.sin(yawRad);
  const intoCorridorZ = -Math.cos(yawRad);
  const spawnAlong = ENTRANCE_WORLD_DEPTH - ENTRANCE_SPAWN_FROM_BACK;
  const spawn = {
    x: portal.x + intoCorridorX * spawnAlong,
    z: portal.z + intoCorridorZ * spawnAlong,
  };
  return { portal, spawn, yawDeg, yawRad };
}

export type EntranceBuildResult = {
  root: THREE.Group;
  spawn: { x: number; z: number; yawDeg: number };
  walkBounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** World AABBs for foyer stairs + portal landing (surfaceY synced to meshes). */
  climbBands: ClimbBand[];
  pedestalRoot: THREE.Object3D;
  /** Booklet mesh on the pedestal; hide when the visitor is holding it. */
  bookletMesh: THREE.Object3D;
  dispose: () => void;
};

/** World AABB of a local-XZ rect under entrance yaw about the portal. */
export function localRectToWorldAabb(
  portal: { x: number; z: number },
  yawRad: number,
  minLX: number,
  maxLX: number,
  minLZ: number,
  maxLZ: number,
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const c = Math.cos(yawRad);
  const s = Math.sin(yawRad);
  const corners: Array<[number, number]> = [
    [minLX, minLZ],
    [maxLX, minLZ],
    [minLX, maxLZ],
    [maxLX, maxLZ],
  ];
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const wx = portal.x + lx * c + lz * s;
    const wz = portal.z - lx * s + lz * c;
    minX = Math.min(minX, wx);
    maxX = Math.max(maxX, wx);
    minZ = Math.min(minZ, wz);
    maxZ = Math.max(maxZ, wz);
  }
  return { minX, maxX, minZ, maxZ };
}

function boxMesh(
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  mat: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  mesh.name = name;
  mesh.position.set(...position);
  return mesh;
}

/**
 * Always-on entrance module: corridor, arch, left poster, pedestal booklet.
 * Local space: portal at z=0, corridor toward −Z, +Z into gallery.
 */
export function buildEntranceModule(
  layout: GalleryLayout | null | undefined,
  catalog: Catalog,
  options?: {
    previewLite?: boolean;
    entrancePose?: GalleryEntrancePose | null;
    /** Shared with gallery rooms so foyer + layout floors match exactly. */
    floorMat?: THREE.MeshStandardMaterial;
    wallMat?: THREE.MeshStandardMaterial;
  },
): EntranceBuildResult {
  const pose = computeEntrancePose(
    options?.entrancePose ?? layout?.entrance,
  );
  const root = new THREE.Group();
  root.name = "Entrance";
  root.position.set(pose.portal.x, 0, pose.portal.z);
  root.rotation.y = pose.yawRad;

  const ownsFloor = !options?.floorMat;
  const ownsWall = !options?.wallMat;
  const floorMat = options?.floorMat ?? makeFloorMaterial();
  const wallMat = options?.wallMat ?? makeWallMaterial();
  const trimMat = makeSurfaceMaterial(TRIM_COLOR);
  const topMat = makeSurfaceMaterial(TOP_COLOR);
  const bookletMat = makeSurfaceMaterial(BOOKLET_COLOR);
  const posterMat = new THREE.MeshBasicMaterial({
    color: POSTER_COLOR,
    toneMapped: true,
  });
  const mats: Array<{ dispose: () => void }> = [
    trimMat,
    topMat,
    bookletMat,
    posterMat,
  ];
  if (ownsFloor) mats.push(floorMat);
  if (ownsWall) mats.push(wallMat);

  const midLocalZ = -ENTRANCE_WORLD_DEPTH * 0.5;
  /** Corridor width matches plan foyer AABB (not legacy ROOM.width = 8). */
  const w = ENTRANCE_WIDTH;
  const h = GALLERY_HEIGHT;

  root.add(
    boxMesh(
      "EntranceFloor",
      [w, FLOOR_THICKNESS, ENTRANCE_WORLD_DEPTH],
      [0, FLOOR_Y, midLocalZ],
      floorMat,
    ),
  );
  root.add(
    boxMesh(
      "EntranceWallLeft",
      [WALL_THICKNESS, h, ENTRANCE_WORLD_DEPTH],
      [-w * 0.5, h * 0.5, midLocalZ],
      wallMat,
    ),
  );
  root.add(
    boxMesh(
      "EntranceWallRight",
      [WALL_THICKNESS, h, ENTRANCE_WORLD_DEPTH],
      [w * 0.5, h * 0.5, midLocalZ],
      wallMat,
    ),
  );
  root.add(
    boxMesh(
      "EntranceWallBack",
      [w, h, WALL_THICKNESS],
      [0, h * 0.5, -ENTRANCE_WORLD_DEPTH],
      wallMat,
    ),
  );

  // Arch at portal (local z = 0)
  const halfGap = ENTRANCE_ARCH_WIDTH * 0.5;
  const pillarW = 0.32;
  root.add(
    boxMesh(
      "ArchPillarL",
      [pillarW, ENTRANCE_ARCH_HEIGHT, ENTRANCE_ARCH_THICKNESS],
      [-halfGap - pillarW * 0.5, ENTRANCE_ARCH_HEIGHT * 0.5, 0],
      trimMat,
    ),
  );
  root.add(
    boxMesh(
      "ArchPillarR",
      [pillarW, ENTRANCE_ARCH_HEIGHT, ENTRANCE_ARCH_THICKNESS],
      [halfGap + pillarW * 0.5, ENTRANCE_ARCH_HEIGHT * 0.5, 0],
      trimMat,
    ),
  );
  root.add(
    boxMesh(
      "ArchLintel",
      [ENTRANCE_ARCH_WIDTH + pillarW * 2, 0.4, ENTRANCE_ARCH_THICKNESS + 0.05],
      [0, ENTRANCE_ARCH_HEIGHT + 0.2, 0],
      trimMat,
    ),
  );

  const side = (w - ENTRANCE_ARCH_WIDTH) * 0.5 - pillarW;
  if (side > 0.05) {
    const sideX = ENTRANCE_ARCH_WIDTH * 0.5 + pillarW + side * 0.5;
    root.add(
      boxMesh(
        "ArchFillL",
        [side, h, ENTRANCE_ARCH_THICKNESS * 0.7],
        [-sideX, h * 0.5, 0],
        wallMat,
      ),
    );
    root.add(
      boxMesh(
        "ArchFillR",
        [side, h, ENTRANCE_ARCH_THICKNESS * 0.7],
        [sideX, h * 0.5, 0],
        wallMat,
      ),
    );
  }

  // Left wall poster (~A0-ish at eye line)
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.55), posterMat);
  poster.name = "EntrancePoster";
  poster.position.set(-w * 0.5 + 0.06, 1.55, -ENTRANCE_WORLD_DEPTH * 0.62);
  poster.rotation.y = Math.PI / 2;
  root.add(poster);

  const posterUrl = catalog.settings?.entrance?.posterUrl;
  if (posterUrl && !options?.previewLite) {
    void loadColorTexture(posterUrl).then((tex) => {
      if (!tex) return;
      applyTextureToMaterial(posterMat, tex);
      mats.push(tex);
    });
  }

  // Always-on foyer stairs (local −Z → portal), pulled short of the portal plane.
  // Negative polygonOffset so treads win any residual depth fight with room floors.
  const stepMat = makeSurfaceMaterial(STEP_COLOR);
  stepMat.polygonOffset = true;
  stepMat.polygonOffsetFactor = -1;
  stepMat.polygonOffsetUnits = -1;
  mats.push(stepMat);
  const climbBands: ClimbBand[] = [];
  const stepHalfW = ENTRANCE_ARCH_WIDTH * 0.5;
  const gap = STAIR_PORTAL_GAP;
  for (let i = 0; i < STEP_COUNT; i++) {
    const surfaceY = (i + 1) * STEP_RISE;
    const minLZ = -(STEP_COUNT - i) * STEP_DEPTH - gap;
    const maxLZ = -(STEP_COUNT - i - 1) * STEP_DEPTH - gap;
    const midZ = (minLZ + maxLZ) * 0.5;
    root.add(
      boxMesh(
        `EntranceStep${i + 1}`,
        [ENTRANCE_ARCH_WIDTH, surfaceY, STEP_DEPTH],
        [0, surfaceY * 0.5, midZ],
        stepMat,
      ),
    );
    climbBands.push({
      ...localRectToWorldAabb(
        pose.portal,
        pose.yawRad,
        -stepHalfW,
        stepHalfW,
        minLZ,
        maxLZ,
      ),
      surfaceY,
    });
  }

  // Landing only when no gallery rooms: with rooms, the raised floor covers the
  // gallery side — a coplanar landing slab z-fights (blue floor through treads).
  const emitLandingMesh = layoutIsEmpty(layout);
  if (emitLandingMesh) {
    root.add(
      boxMesh(
        "EntranceLanding",
        [ENTRANCE_ARCH_WIDTH, FLOOR_THICKNESS, PORTAL_LANDING_DEPTH],
        [0, FLOOR_Y + GALLERY_FLOOR_RAISE, PORTAL_LANDING_DEPTH * 0.5],
        floorMat,
      ),
    );
  }
  climbBands.push({
    ...localRectToWorldAabb(
      pose.portal,
      pose.yawRad,
      -stepHalfW,
      stepHalfW,
      0,
      PORTAL_LANDING_DEPTH,
    ),
    surfaceY: GALLERY_FLOOR_RAISE,
  });

  // Museum table in clear foyer (behind stair run), left of walk path.
  const stairRun = STEP_COUNT * STEP_DEPTH + STAIR_PORTAL_GAP;
  const wallClearX = w * 0.5 - PEDESTAL_TOP_SIZE[0] * 0.5 - 0.12;
  const besideArchX = halfGap + PEDESTAL_TOP_SIZE[0] * 0.35;
  const pedX = -Math.min(wallClearX, besideArchX);
  const pedZ = -(stairRun + (ENTRANCE_WORLD_DEPTH - stairRun) * 0.55);
  const pedestalRoot = new THREE.Group();
  pedestalRoot.name = "Pedestal";
  pedestalRoot.userData.isPedestal = true;
  pedestalRoot.position.set(pedX, 0, pedZ);
  const baseH = PEDESTAL_BASE_SIZE[1];
  const topH = PEDESTAL_TOP_SIZE[1];
  const topY = baseH + topH * 0.5;
  const bookletY = baseH + topH + BOOKLET_SIZE[1] * 0.5 + 0.01;
  pedestalRoot.add(
    boxMesh(
      "PedestalBase",
      [...PEDESTAL_BASE_SIZE],
      [0, baseH * 0.5, 0],
      trimMat,
    ),
  );
  pedestalRoot.add(
    boxMesh("PedestalTop", [...PEDESTAL_TOP_SIZE], [0, topY, 0], topMat),
  );
  const booklet = boxMesh(
    "PedestalBooklet",
    [...BOOKLET_SIZE],
    [0, bookletY, 0],
    bookletMat,
  );
  booklet.rotation.y = (18 * Math.PI) / 180;
  booklet.userData.isPedestal = true;
  booklet.userData.isBooklet = true;
  pedestalRoot.add(booklet);

  // Invisible pick proxy (~reach envelope around table height)
  const trigger = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.7, 1.15),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  trigger.name = "PedestalTrigger";
  trigger.position.set(0, 0.95, 0);
  trigger.userData.isPedestal = true;
  pedestalRoot.add(trigger);
  root.add(pedestalRoot);

  // Walk AABB in world space: corridor + stair/landing footprints.
  let walkBounds = localRectToWorldAabb(
    pose.portal,
    pose.yawRad,
    -w * 0.5 + 0.35,
    w * 0.5 - 0.35,
    -ENTRANCE_WORLD_DEPTH + 0.35,
    0,
  );
  for (const band of climbBands) {
    walkBounds = {
      minX: Math.min(walkBounds.minX, band.minX),
      maxX: Math.max(walkBounds.maxX, band.maxX),
      minZ: Math.min(walkBounds.minZ, band.minZ),
      maxZ: Math.max(walkBounds.maxZ, band.maxZ),
    };
  }

  return {
    root,
    spawn: { x: pose.spawn.x, z: pose.spawn.z, yawDeg: pose.yawDeg },
    walkBounds,
    climbBands,
    pedestalRoot,
    bookletMesh: booklet,
    dispose: () => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
      for (const m of mats) {
        if ("dispose" in m && typeof m.dispose === "function") m.dispose();
      }
    },
  };
}

export function unionWalkBounds(
  a: { minX: number; maxX: number; minZ: number; maxZ: number } | null,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): { minX: number; maxX: number; minZ: number; maxZ: number } {
  if (!a) return { ...b };
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}
