import type { GalleryEntrancePose, GalleryRoom } from "./catalog-types";
import { ENTRANCE_ROOM_ID } from "./catalog-types";
import {
  entranceAsRoom,
  entranceWorldVertices,
  roomWorldVertices,
  type Vec2,
} from "./layout-geometry";

/** Must match `gallery-room-editor.tsx` plan view. */
export const EDITOR_PLAN_SCALE = 36;
export const EDITOR_PLAN_PAD = 40;
export const EDITOR_PLAN_VIEW_W = 720;
export const EDITOR_PLAN_VIEW_H = 520;

export type EditorPan = { x: number; y: number };

/** Same origin as admin room plan (`boundsOrigin`). */
export function editorPlanOrigin(
  rooms: GalleryRoom[],
  entrance: GalleryEntrancePose,
): Vec2 {
  let minX = Infinity;
  let minZ = Infinity;
  const consider = (verts: Vec2[]) => {
    for (const v of verts) {
      minX = Math.min(minX, v.x);
      minZ = Math.min(minZ, v.z);
    }
  };
  for (const room of rooms) consider(roomWorldVertices(room));
  consider(entranceWorldVertices(entrance));
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) {
    return { x: -4, z: -1 };
  }
  return { x: minX - 1.5, z: minZ - 1.5 };
}

/** World XZ → admin SVG (Y increases with +world Z). */
export function worldToEditorSvg(
  p: Vec2,
  origin: Vec2,
  pan: EditorPan = { x: 0, y: 0 },
): { x: number; y: number } {
  return {
    x: EDITOR_PLAN_PAD + (p.x - origin.x) * EDITOR_PLAN_SCALE + pan.x,
    y: EDITOR_PLAN_PAD + (p.z - origin.z) * EDITOR_PLAN_SCALE + pan.y,
  };
}

export function editorSvgToWorld(
  sx: number,
  sy: number,
  origin: Vec2,
  pan: EditorPan = { x: 0, y: 0 },
): Vec2 {
  return {
    x: origin.x + (sx - EDITOR_PLAN_PAD - pan.x) / EDITOR_PLAN_SCALE,
    z: origin.z + (sy - EDITOR_PLAN_PAD - pan.y) / EDITOR_PLAN_SCALE,
  };
}

/**
 * Map viewport client coords → SVG user space via getBoundingClientRect.
 * Prefer this over createSVGPoint/getScreenCTM (fragile across browsers).
 */
export function clientToEditorSvg(
  clientX: number,
  clientY: number,
  svg: Pick<SVGSVGElement, "getBoundingClientRect">,
  viewW = EDITOR_PLAN_VIEW_W,
  viewH = EDITOR_PLAN_VIEW_H,
): { x: number; y: number } | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  return {
    x: ((clientX - rect.left) / rect.width) * viewW,
    y: ((clientY - rect.top) / rect.height) * viewH,
  };
}

export function clientToEditorWorld(
  clientX: number,
  clientY: number,
  svg: Pick<SVGSVGElement, "getBoundingClientRect">,
  origin: Vec2,
  pan: EditorPan = { x: 0, y: 0 },
  viewW = EDITOR_PLAN_VIEW_W,
  viewH = EDITOR_PLAN_VIEW_H,
): Vec2 | null {
  const sp = clientToEditorSvg(clientX, clientY, svg, viewW, viewH);
  if (!sp) return null;
  return editorSvgToWorld(sp.x, sp.y, origin, pan);
}

export function editorRoomPolygons(
  rooms: GalleryRoom[],
  entrance: GalleryEntrancePose,
): { id: string; verts: Vec2[] }[] {
  const ent = entranceAsRoom(entrance);
  return [
    { id: ENTRANCE_ROOM_ID, verts: roomWorldVertices(ent) },
    ...rooms.map((room) => ({
      id: room.id,
      verts: roomWorldVertices(room),
    })),
  ];
}