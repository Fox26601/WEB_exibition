import * as THREE from "three";
import type { GalleryLayout } from "@/lib/catalog-types";
import { layoutIsEmpty, normalizeLayout } from "@/lib/catalog-types";
import {
  edgePoints,
  roomWorldVertices,
  type Vec2,
} from "@/lib/layout-geometry";
import {
  layoutOverlapRooms,
  shouldKeepFloorTriangle,
  wallSpansForEdge,
} from "@/lib/room-overlap-clip";
import {
  computeAabbXZ,
  triangulatePolygonXZ,
} from "@/lib/polygon-floor";
import {
  DEFAULT_DOOR_WIDTH,
  FLOOR_COLOR,
  FLOOR_THICKNESS,
  FLOOR_Y,
  WALL_COLOR,
} from "./constants";
import { lerpVec2, roomCentroid } from "./room-geometry";
import { addCornerPosts, buildWallAlongEdge } from "./wall-mesh";

function findDoorwayWidth(
  layout: GalleryLayout,
  roomId: string,
  edgeIndex: number,
): number {
  for (const c of layout.connections) {
    if (c.roomA === roomId && c.edgeA === edgeIndex) {
      return Math.max(0.9, c.doorwayWidth);
    }
    if (c.roomB === roomId && c.edgeB === edgeIndex) {
      return Math.max(0.9, c.doorwayWidth);
    }
  }
  return 0;
}

export function makeSurfaceMaterial(
  color: number,
  map?: THREE.Texture,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: map ? 0xffffff : color,
    map,
    roughness: 0.92,
    metalness: 0,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  return mat;
}

function buildRoomFloor(
  parent: THREE.Object3D,
  roomId: string,
  verts: Vec2[],
  overlapRooms: ReturnType<typeof layoutOverlapRooms>,
  floorMat: THREE.Material,
): void {
  const tris = triangulatePolygonXZ(verts);
  if (!tris) {
    const aabb = computeAabbXZ(verts);
    if (!aabb) return;
    const cx = (aabb.minX + aabb.maxX) * 0.5;
    const cz = (aabb.minZ + aabb.maxZ) * 0.5;
    const sx = Math.max(0.25, aabb.maxX - aabb.minX);
    const sz = Math.max(0.25, aabb.maxZ - aabb.minZ);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(sx, FLOOR_THICKNESS, sz),
      floorMat,
    );
    mesh.position.set(cx, FLOOR_Y, cz);
    parent.add(mesh);
    return;
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
  const use = kept.length >= 3 ? kept : tris;
  if (use.length < 3) return;

  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i < verts.length; i++) {
    positions.push(verts[i].x, FLOOR_Y, verts[i].z);
  }
  for (let i = 0; i < use.length; i++) indices.push(use[i]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  parent.add(new THREE.Mesh(geom, floorMat));
}

export type LayoutBuildResult = {
  root: THREE.Group;
  floorMat: THREE.MeshStandardMaterial;
  wallMat: THREE.MeshStandardMaterial;
  dispose: () => void;
};

export function buildLayoutScene(
  layoutInput: GalleryLayout,
  textures: { floor?: THREE.Texture; wall?: THREE.Texture },
): LayoutBuildResult {
  const layout = normalizeLayout(layoutInput);
  const root = new THREE.Group();
  root.name = "GalleryLayout";

  const floorMat = makeSurfaceMaterial(FLOOR_COLOR, textures.floor);
  const wallMat = makeSurfaceMaterial(WALL_COLOR, textures.wall);
  const overlapRooms = layoutOverlapRooms(layout);

  for (const room of layout.rooms) {
    if (!room?.id) continue;
    const roomRoot = new THREE.Group();
    roomRoot.name = `Room_${room.id}`;
    const verts = roomWorldVertices(room);
    if (verts.length < 3) continue;

    buildRoomFloor(roomRoot, room.id, verts, overlapRooms, floorMat);

    for (let i = 0; i < verts.length; i++) {
      const [a, b] = edgePoints(verts, i);
      const doorway = findDoorwayWidth(layout, room.id, i);
      const spans =
        overlapRooms.length > 1
          ? wallSpansForEdge(overlapRooms, room.id, i)
          : null;

      if (spans && spans.length > 0) {
        for (const span of spans) {
          const aSpan = lerpVec2(a, b, span.t0);
          const bSpan = lerpVec2(a, b, span.t1);
          let spanDoor = 0;
          if (doorway > 0.01 && span.t0 <= 0.5 && span.t1 >= 0.5) {
            spanDoor = Math.min(
              doorway,
              Math.hypot(bSpan.x - aSpan.x, bSpan.z - aSpan.z) - 0.2,
            );
          }
          buildWallAlongEdge(roomRoot, aSpan, bSpan, spanDoor, wallMat, verts);
        }
      } else if (spans && spans.length === 0) {
        continue;
      } else {
        const door =
          doorway > 0.01 ? doorway : isEntranceEdgeFallback(a, b, verts) ? DEFAULT_DOOR_WIDTH : 0;
        buildWallAlongEdge(roomRoot, a, b, door, wallMat, verts);
      }
    }

    addCornerPosts(roomRoot, verts, wallMat);

    root.add(roomRoot);
  }

  return {
    root,
    floorMat,
    wallMat,
    dispose: () => {
      root.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
      floorMat.dispose();
      wallMat.dispose();
    },
  };
}

function isEntranceEdgeFallback(a: Vec2, b: Vec2, verts: Vec2[]): boolean {
  let minZ = Infinity;
  for (const v of verts) minZ = Math.min(minZ, v.z);
  const midZ = (a.z + b.z) * 0.5;
  if (midZ > minZ + 0.35) return false;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.abs(dx) >= Math.abs(dz) * 0.6;
}

export function layoutHasRooms(layout?: GalleryLayout | null): boolean {
  return !layoutIsEmpty(layout);
}