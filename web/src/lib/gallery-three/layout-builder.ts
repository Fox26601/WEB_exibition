import * as THREE from "three";
import type { GalleryLayout } from "@/lib/catalog-types";
import { layoutIsEmpty, normalizeLayout } from "@/lib/catalog-types";
import { roomWorldVertices, type Vec2 } from "@/lib/layout-geometry";
import {
  layoutOverlapRooms,
  shouldKeepFloorTriangle,
} from "@/lib/room-overlap-clip";
import {
  computeAabbXZ,
  triangulatePolygonXZ,
} from "@/lib/polygon-floor";
import { buildLayoutWallPlan } from "@/lib/wall-plan";
import {
  FLOOR_COLOR,
  FLOOR_SURFACE_Y,
  FLOOR_THICKNESS,
  FLOOR_UV_METERS,
  FLOOR_Y,
  WALL_COLOR,
} from "./constants";
import { buildWallMeshesFromPlan } from "./wall-slab-builder";

export function makeSurfaceMaterial(
  color: number,
  map?: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : color,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  if (map) mat.map = map;
  return mat;
}

/** Shared foyer + gallery floor material (solid or mapped). */
export function makeFloorMaterial(map?: THREE.Texture): THREE.MeshStandardMaterial {
  return makeSurfaceMaterial(FLOOR_COLOR, map);
}

export function makeWallMaterial(map?: THREE.Texture): THREE.MeshStandardMaterial {
  return makeSurfaceMaterial(WALL_COLOR, map);
}

function appendFloorVertex(
  positions: number[],
  uvs: number[],
  x: number,
  z: number,
): void {
  positions.push(x, FLOOR_SURFACE_Y, z);
  uvs.push(x / FLOOR_UV_METERS, z / FLOOR_UV_METERS);
}

/**
 * Triangulated room floor covering the full polygon (wall centerlines).
 * World-space UVs match foyer tiling density; surface Y matches foyer slab top.
 */
export function buildRoomFloor(
  parent: THREE.Object3D,
  roomId: string,
  verts: Vec2[],
  overlapRooms: ReturnType<typeof layoutOverlapRooms>,
  floorMat: THREE.Material,
): THREE.Mesh | null {
  const tris = triangulatePolygonXZ(verts);
  if (!tris) {
    const aabb = computeAabbXZ(verts);
    if (!aabb) return null;
    const cx = (aabb.minX + aabb.maxX) * 0.5;
    const cz = (aabb.minZ + aabb.maxZ) * 0.5;
    const sx = Math.max(0.25, aabb.maxX - aabb.minX);
    const sz = Math.max(0.25, aabb.maxZ - aabb.minZ);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, FLOOR_THICKNESS, sz),
      floorMat,
    );
    mesh.name = `Floor_${roomId}`;
    // Box centered at FLOOR_Y so the top face lands on FLOOR_SURFACE_Y (foyer parity).
    mesh.position.set(cx, FLOOR_Y, cz);
    parent.add(mesh);
    return mesh;
  }

  const kept: number[] = [];
  const multiOverlap = overlapRooms.length > 1;
  for (let t = 0; t + 2 < tris.length; t += 3) {
    const ia = tris[t];
    const ib = tris[t + 1];
    const ic = tris[t + 2];
    const cx = (verts[ia].x + verts[ib].x + verts[ic].x) / 3;
    const cz = (verts[ia].z + verts[ib].z + verts[ic].z) / 3;
    if (multiOverlap && !shouldKeepFloorTriangle(overlapRooms, roomId, { x: cx, z: cz })) {
      continue;
    }
    kept.push(ia, ib, ic);
  }
  // Prefer owner triangles; if overlap filter emptied the set, keep full fan
  // so the room still has complete floor fill within its walls.
  const use = kept.length >= 3 ? kept : tris;
  if (use.length < 3) return null;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    appendFloorVertex(positions, uvs, verts[i].x, verts[i].z);
  }
  for (let i = 0; i < use.length; i++) indices.push(use[i]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, floorMat);
  mesh.name = `Floor_${roomId}`;
  parent.add(mesh);
  return mesh;
}

export type LayoutSurfaceMaterials = {
  floorMat?: THREE.MeshStandardMaterial;
  wallMat?: THREE.MeshStandardMaterial;
};

export type LayoutBuildResult = {
  root: THREE.Group;
  floorMat: THREE.MeshStandardMaterial;
  wallMat: THREE.MeshStandardMaterial;
  dispose: () => void;
};

/**
 * Floors + wall-plan slabs only. Open sky: no ceiling lid/skirt.
 * Corner joints: butt spans (WALL_CORNER_JOIN=0) — exact lengths, no posts/fat miters.
 * Floor material matches foyer (`makeFloorMaterial` / shared instance).
 */
export function buildLayoutScene(
  layoutInput: GalleryLayout,
  textures: { floor?: THREE.Texture; wall?: THREE.Texture } = {},
  shared?: LayoutSurfaceMaterials,
): LayoutBuildResult {
  const layout = normalizeLayout(layoutInput);
  const plan = buildLayoutWallPlan(layout);
  const root = new THREE.Group();
  root.name = "GalleryLayout";

  const ownsFloor = !shared?.floorMat;
  const ownsWall = !shared?.wallMat;
  const floorMat = shared?.floorMat ?? makeFloorMaterial(textures.floor);
  const wallMat = shared?.wallMat ?? makeWallMaterial(textures.wall);
  const overlapRooms = layoutOverlapRooms(layout);
  const roomRoots = new Map<string, THREE.Object3D>();

  for (const room of layout.rooms) {
    if (!room?.id) continue;
    const roomRoot = new THREE.Group();
    roomRoot.name = `Room_${room.id}`;
    const verts = roomWorldVertices(room);
    if (verts.length < 3) continue;

    buildRoomFloor(roomRoot, room.id, verts, overlapRooms, floorMat);
    roomRoots.set(room.id, roomRoot);
    root.add(roomRoot);
  }

  buildWallMeshesFromPlan(roomRoots, plan, layout, wallMat);

  return {
    root,
    floorMat,
    wallMat,
    dispose: () => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
      if (ownsFloor) floorMat.dispose();
      if (ownsWall) wallMat.dispose();
    },
  };
}

export function layoutHasRooms(layout?: GalleryLayout | null): boolean {
  return !layoutIsEmpty(layout);
}
