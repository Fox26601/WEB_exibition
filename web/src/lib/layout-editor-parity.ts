import type { ArtworkPlacement, GalleryLayout } from "./catalog-types";
import { normalizeLayout } from "./catalog-types";
import {
  edgeLength,
  edgeMidpoint,
  edgePoints,
  roomWorldVertices,
} from "./layout-geometry";
import { placementWorldPoint } from "./placement-eval";
import { placementWorldPose } from "./placement-pose";
import {
  editorPlanOrigin,
  editorSvgToWorld,
  worldToEditorSvg,
} from "./layout-editor-projection";
import type { WallSpan } from "./room-overlap-clip";
import {
  buildLayoutWallPlan,
  wallPlanSpansForEdge,
} from "./wall-plan";
import { WALL_INSET } from "./gallery-three/constants";
import { inwardNormal, roomCentroid } from "./gallery-three/room-geometry";

export type ParityIssue = { code: string; detail: string };

export type LayoutEditorParityReport = {
  ok: boolean;
  issues: ParityIssue[];
};

const EPS = 1e-4;

function spanCoversT(spans: WallSpan[], t: number): boolean {
  return spans.some((s) => t >= s.t0 - EPS && t <= s.t1 + EPS);
}

function tOnVisibleWall(
  layout: GalleryLayout,
  placement: ArtworkPlacement,
): boolean {
  if (placement.kind !== "painting") return true;
  if (placement.wallEdgeIndex == null || placement.tAlongEdge == null) return false;
  const plan = buildLayoutWallPlan(layout);
  const spans = wallPlanSpansForEdge(
    plan,
    placement.roomId,
    placement.wallEdgeIndex,
  );
  if (spans.length === 0) return false;
  return spanCoversT(spans, placement.tAlongEdge);
}

/** Compare admin 2D plan math with Three.js layout consumption (prod fixture / any layout). */
export function evaluateLayoutEditorParity(
  layoutInput: GalleryLayout,
): LayoutEditorParityReport {
  const layout = normalizeLayout(layoutInput);
  const issues: ParityIssue[] = [];
  const origin = editorPlanOrigin(layout.rooms, layout.entrance);

  for (const room of layout.rooms) {
    const verts = roomWorldVertices(room);
    for (const v of verts) {
      const svg = worldToEditorSvg(v, origin);
      const back = editorSvgToWorld(svg.x, svg.y, origin);
      if (Math.hypot(back.x - v.x, back.z - v.z) > EPS) {
        issues.push({
          code: "projection_roundtrip",
          detail: `room ${room.id} vertex projection drift`,
        });
        break;
      }
    }
  }

  for (const p of layout.placements) {
    const editorPt = placementWorldPoint(p, layout);
    if (!editorPt) {
      issues.push({
        code: "placement_world",
        detail: `missing world point for ${p.artworkId}`,
      });
      continue;
    }

    const pose = placementWorldPose(p, layout);
    if (!pose) {
      issues.push({
        code: "runtime_pose",
        detail: `no 3D pose for ${p.artworkId}`,
      });
      continue;
    }
    if (p.kind === "sculpture") {
      const drift = Math.hypot(
        pose.position.x - editorPt.x,
        pose.position.z - editorPt.z,
      );
      if (drift > 0.025) {
        issues.push({
          code: "placement_runtime",
          detail: `${p.artworkId} sculpture 3D drift ${drift.toFixed(3)} from floor point`,
        });
      }
      continue;
    }

    const room = layout.rooms.find((r) => r.id === p.roomId);
    if (!room) continue;
    const verts = roomWorldVertices(room);
    const edge =
      ((p.wallEdgeIndex ?? 0) % verts.length + verts.length) % verts.length;
    const [a, b] = edgePoints(verts, edge);
    const centroid = roomCentroid(verts) ?? edgeMidpoint(a, b);
    const inward = inwardNormal(a, b, centroid);
    const expected = {
      x: editorPt.x + inward.x * WALL_INSET,
      z: editorPt.z + inward.z * WALL_INSET,
    };
    const drift = Math.hypot(
      pose.position.x - expected.x,
      pose.position.z - expected.z,
    );
    if (drift > 0.025) {
      issues.push({
        code: "placement_runtime",
        detail: `${p.artworkId} 3D drift ${drift.toFixed(3)} from editor point + inset`,
      });
    }
    if (!tOnVisibleWall(layout, p)) {
      issues.push({
        code: "overlap_wall_span",
        detail: `${p.artworkId} t=${p.tAlongEdge} not on runtime wall span (editor shows full edge)`,
      });
    }
  }

  for (const c of layout.connections) {
    const roomA = layout.rooms.find((r) => r.id === c.roomA);
    if (!roomA) continue;
    const verts = roomWorldVertices(roomA);
    const [a, b] = edgePoints(verts, c.edgeA);
    const mid = edgeMidpoint(a, b);
    const len = edgeLength(a, b);
    if (len < 0.1) continue;
    const doorHalf = (c.doorwayWidth ?? 0) * 0.5;
    const tMid = 0.5;
    const doorMid = {
      x: a.x + (b.x - a.x) * tMid,
      z: a.z + (b.z - a.z) * tMid,
    };
    if (Math.hypot(mid.x - doorMid.x, mid.z - doorMid.z) > EPS) {
      issues.push({
        code: "door_mid",
        detail: `connection ${c.roomA}:${c.roomB} door not at edge midpoint`,
      });
    }
    if (doorHalf > len * 0.5 + 0.01) {
      issues.push({
        code: "door_width",
        detail: `connection ${c.roomA}:${c.roomB} doorway wider than edge`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}