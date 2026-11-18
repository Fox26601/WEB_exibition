import * as THREE from "three";
import type { GalleryLayout } from "@/lib/catalog-types";
import { layoutIsEmpty, normalizeLayout } from "@/lib/catalog-types";
import { edgePoints, roomWorldVertices, type Vec2 } from "@/lib/layout-geometry";
import {
  edgeFullyInsideOverlap,
  layoutOverlapRooms,
  shouldKeepFloorTriangle,
  splitPointsOnEdge,
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
  GALLERY_HEIGHT,
  WALL_COLOR,
  WALL_THICKNESS,
} from "./constants";
import { layoutWalkBounds } from "./painting-pose";
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

/** Blocks sky leaking through open-top corners along wall crest. */
function addCornerCeilingBlocks(
  parent: THREE.Object3D,
  verts: Vec2[],
  mat: THREE.Material,
): void {
  const y = FLOOR_Y + GALLERY_HEIGHT + 0.02;
  const size = WALL_THICKNESS * 5.2;
  for (const v of verts) {
    const block = new THREE.Mesh(
      new THREE.BoxGeometry(size, 0.48, size),
      mat,
    );
    block.position.set(v.x, y, v.z);
    parent.add(block);
  }
}

function buildRoomCeilingCap(
  parent: THREE.Object3D,
  verts: Vec2[],
  mat: THREE.Material,
): void {
  const tris = triangulatePolygonXZ(verts);
  if (!tris || tris.length < 3) return;
  const y = FLOOR_Y + GALLERY_HEIGHT - 0.04;
  const positions: number[] = [];
  for (const v of verts) {
    positions.push(v.x, y, v.z);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setIndex([...tris]);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = -1;
  parent.add(mesh);
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
    buildRoomCeilingCap(roomRoot, verts, wallMat);
    addCornerCeilingBlocks(roomRoot, verts, wallMat);

    for (let i = 0; i < verts.length; i++) {
      const [a, b] = edgePoints(verts, i);
      const doorway = findDoorwayWidth(layout, room.id, i);
      const door =
        doorway > 0.01
          ? doorway
          : isEntranceEdgeFallback(a, b, verts)
            ? DEFAULT_DOOR_WIDTH
            : 0;

      if (overlapRooms.length > 1) {
        if (edgeFullyInsideOverlap(overlapRooms, room.id, a, b)) {
          continue;
        }
        buildWallAlongEdge(roomRoot, a, b, door, wallMat, verts);
        for (const split of splitPointsOnEdge(overlapRooms, room.id, i)) {
          const postH = GALLERY_HEIGHT - FLOOR_Y + 0.2;
          const post = new THREE.Mesh(
            new THREE.BoxGeometry(
              WALL_THICKNESS * 4.2,
              postH,
              WALL_THICKNESS * 4.2,
            ),
            wallMat,
          );
          post.position.set(split.x, FLOOR_Y + postH * 0.5, split.z);
          roomRoot.add(post);
        }
        continue;
      }

      buildWallAlongEdge(roomRoot, a, b, door, wallMat, verts);
    }

    addCornerPosts(roomRoot, verts, wallMat);

    root.add(roomRoot);
  }

  addLayoutJunctionPosts(root, layout, wallMat);
  addLayoutCeilingLid(root, layout, wallMat);

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

/** Shared vertices across rooms — extra mass closes overlap dihedral gaps. */
function addLayoutCeilingLid(
  parent: THREE.Object3D,
  layout: GalleryLayout,
  mat: THREE.Material,
): void {
  const bounds = layoutWalkBounds(layout.rooms);
  if (!bounds) return;
  const pad = 3.2;
  const w = Math.max(1, bounds.maxX - bounds.minX + pad);
  const d = Math.max(1, bounds.maxZ - bounds.minZ + pad);
  const y0 = FLOOR_Y + GALLERY_HEIGHT - 0.08;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(w, 0.55, d), mat);
  lid.position.set(
    (bounds.minX + bounds.maxX) * 0.5,
    y0 + 0.275,
    (bounds.minZ + bounds.maxZ) * 0.5,
  );
  parent.add(lid);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.52, d + 0.6), mat);
  skirt.position.set(lid.position.x, FLOOR_Y + GALLERY_HEIGHT + 0.22, lid.position.z);
  parent.add(skirt);
}

function addLayoutJunctionPosts(
  parent: THREE.Object3D,
  layout: GalleryLayout,
  wallMat: THREE.Material,
): void {
  const pts: Vec2[] = [];
  const merge = 0.1;
  for (const room of layout.rooms) {
    for (const v of roomWorldVertices(room)) {
      if (pts.some((p) => Math.hypot(p.x - v.x, p.z - v.z) < merge)) continue;
      pts.push(v);
    }
  }
  const postH = GALLERY_HEIGHT - FLOOR_Y + 0.22;
  const postY = FLOOR_Y + postH * 0.5;
  const size = WALL_THICKNESS * 4.2;
  for (const p of pts) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(size, postH, size),
      wallMat,
    );
    post.position.set(p.x, postY, p.z);
    parent.add(post);
  }
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