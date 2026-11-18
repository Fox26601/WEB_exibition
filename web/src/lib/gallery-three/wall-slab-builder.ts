import * as THREE from "three";
import type { GalleryLayout } from "@/lib/catalog-types";
import { edgePoints, roomWorldVertices } from "@/lib/layout-geometry";
import type { LayoutWallPlan } from "@/lib/wall-plan";
import { lerpVec2 } from "./room-geometry";
import { buildWallAlongEdge } from "./wall-mesh";

/**
 * Instantiate Three.js wall meshes from a domain LayoutWallPlan.
 */
export function buildWallMeshesFromPlan(
  roomRoots: Map<string, THREE.Object3D>,
  plan: LayoutWallPlan,
  layout: GalleryLayout,
  wallMat: THREE.Material,
): void {
  for (const seg of plan.segments) {
    const room = layout.rooms.find((r) => r.id === seg.roomId);
    const parent = roomRoots.get(seg.roomId);
    if (!room || !parent) continue;
    const verts = roomWorldVertices(room);
    const [a, b] = edgePoints(verts, seg.edgeIndex);
    const aSpan = lerpVec2(a, b, seg.t0);
    const bSpan = lerpVec2(a, b, seg.t1);
    buildWallAlongEdge(
      parent,
      aSpan,
      bSpan,
      seg.doorwayWidth,
      wallMat,
      verts,
    );
  }
}