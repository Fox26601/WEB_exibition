import * as THREE from "three";
import type { GalleryLayout } from "@/lib/catalog-types";
import { edgePoints, roomWorldVertices } from "@/lib/layout-geometry";
import type { LayoutWallPlan } from "@/lib/wall-plan";
import { lerpVec2 } from "./room-geometry";
import { buildWallAlongEdge } from "./wall-mesh";

/**
 * Instantiate Three.js wall meshes from a domain LayoutWallPlan.
 * Segment join pads come from the plan (vertex T/2); doorway ends stay flush.
 * `wallMatForRoom` supplies the owning room's wall tint material.
 */
export function buildWallMeshesFromPlan(
  roomRoots: Map<string, THREE.Object3D>,
  plan: LayoutWallPlan,
  layout: GalleryLayout,
  wallMatForRoom: (roomId: string) => THREE.Material,
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
      wallMatForRoom(seg.roomId),
      verts,
      {
        joinA: seg.join0,
        joinB: seg.join1,
      },
    );
  }
}
