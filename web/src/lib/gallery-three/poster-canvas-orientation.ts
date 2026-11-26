import type {
  ArtworkPlacement,
  ArtworkType,
  GalleryLayout,
} from "@/lib/catalog-types";
import { edgePoints, roomWorldVertices } from "@/lib/layout-geometry";
import { paintingPoseFromPlacement } from "./painting-pose";

/** Poster / wall-media UV orientation on inward-facing canvases. */
export type PosterCanvasOrientation = {
  textureMirror: boolean;
  rotate180: boolean;
  /** Mirror V after U mirror so still labels stay upright. */
  flipV?: boolean;
  /** Three.js Texture.flipY baseline before wall heuristics. */
  flipY?: boolean;
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
    return { textureMirror: true, rotate180: false, flipY: true };
  }
  const pose = paintingPoseFromPlacement(placement, layout);
  if (!pose) return { textureMirror: true, rotate180: false, flipY: true };
  const room = layout.rooms.find((r) => r.id === placement.roomId);
  if (!room) return { textureMirror: true, rotate180: false, flipY: true };
  const verts = roomWorldVertices(room);
  if (verts.length < 2) {
    return { textureMirror: true, rotate180: false, flipY: true };
  }
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
  return {
    textureMirror: false,
    rotate180: false,
    flipV: dot > 0,
    flipY: true,
  };
}

/** Corridor slot fallback when no layout placement exists. */
export function posterCanvasOrientation(
  _artworkId: string,
): PosterCanvasOrientation {
  return { textureMirror: true, rotate180: false, flipY: true };
}

/**
 * Live wall video: skip still-poster flipV (that mirrored/inverted MP4s).
 */
export function wallMediaOrientation(
  placement: ArtworkPlacement,
  layout: GalleryLayout,
  mediaKind: ArtworkType | "image" | "video",
): PosterCanvasOrientation {
  const still = posterCanvasOrientationForPlacement(placement, layout);
  if (mediaKind === "video") {
    return {
      textureMirror: still.textureMirror,
      rotate180: false,
      flipV: false,
      flipY: true,
    };
  }
  return still;
}

export function wallMediaOrientationCorridor(
  mediaKind: ArtworkType | "image" | "video",
): PosterCanvasOrientation {
  const still = posterCanvasOrientation("");
  if (mediaKind === "video") {
    return {
      textureMirror: still.textureMirror,
      rotate180: false,
      flipV: false,
      flipY: true,
    };
  }
  return still;
}
