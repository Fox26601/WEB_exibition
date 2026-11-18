import type { ArtworkPlacement, GalleryLayout } from "@/lib/catalog-types";
import { edgePoints, roomWorldVertices } from "@/lib/layout-geometry";
import { paintingPoseFromPlacement } from "./painting-pose";

/** Poster label readability on inward-facing canvases. */
export type PosterCanvasOrientation = {
  textureMirror: boolean;
  rotate180: boolean;
  /** Mirror V after U mirror so labels stay upright. */
  flipV?: boolean;
};

/**
 * Align texture U with wall edge tangent (+X on the canvas plane).
 * Poster JPEGs are authored for +Z-facing quads; mirror U when tangent opposes local +X.
 */
export function posterCanvasOrientationForPlacement(
  placement: ArtworkPlacement,
  layout: GalleryLayout,
): PosterCanvasOrientation {
  if (placement.kind !== "painting") {
    return { textureMirror: true, rotate180: false };
  }
  const pose = paintingPoseFromPlacement(placement, layout);
  if (!pose) return { textureMirror: true, rotate180: false };
  const room = layout.rooms.find((r) => r.id === placement.roomId);
  if (!room) return { textureMirror: true, rotate180: false };
  const verts = roomWorldVertices(room);
  if (verts.length < 2) return { textureMirror: true, rotate180: false };
  const edgeIdx =
    ((placement.wallEdgeIndex ?? 0) % verts.length + verts.length) % verts.length;
  const [a, b] = edgePoints(verts, edgeIdx);
  let ux = b.x - a.x;
  let uz = b.z - a.z;
  const len = Math.hypot(ux, uz) || 1;
  ux /= len;
  uz /= len;
  const yaw = pose.yawRad;
  const lx = Math.cos(yaw);
  const lz = -Math.sin(yaw);
  const dot = ux * lx + uz * lz;
  return { textureMirror: false, rotate180: false, flipV: dot > 0 };
}

/** Corridor slot fallback when no layout placement exists. */
export function posterCanvasOrientation(
  _artworkId: string,
): PosterCanvasOrientation {
  return { textureMirror: true, rotate180: false };
}