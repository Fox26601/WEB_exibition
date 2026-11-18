import { ROOM } from "@/lib/room";

export const GALLERY_HEIGHT = ROOM.height;
export const WALL_THICKNESS = 0.18;
/** Painting offset from wall edge. */
export const WALL_INSET = 0.08;
/** Interior wall plane offset from edge. */
export const WALL_PLANE_BIAS = 0.002;
/**
 * Vertex join pad along the edge. 0 = butt joint (exact span length).
 * Positive values reintroduce end overshoot past the adjacent wall face —
 * keep at 0 so corners stay flush without fat overlapping boxes.
 */
export const WALL_CORNER_JOIN = 0;
export const CANVAS_Z_OFFSET = 0.045;
export const FLOOR_Y = -0.05;
export const FLOOR_THICKNESS = 0.1;
/** Walkable top of the floor slab (matches foyer BoxGeometry top face). */
export const FLOOR_SURFACE_Y = FLOOR_Y + FLOOR_THICKNESS * 0.5;
/** World-space UV meters per repeat — keeps foyer + room tiling density aligned. */
export const FLOOR_UV_METERS = 4;

/** Foyer stair count into the raised gallery. */
export const STEP_COUNT = 3;
/** Vertical rise per stair tread (meters). */
export const STEP_RISE = 0.18;
/** Horizontal depth per stair tread along entrance local −Z (meters). */
export const STEP_DEPTH = 0.35;
/** Gallery walk surface above foyer floor (= top tread). */
export const GALLERY_FLOOR_RAISE = STEP_COUNT * STEP_RISE;
/** Thin landing slab on the gallery side of the portal (local +Z). */
export const PORTAL_LANDING_DEPTH = 0.3;
/** Eye height above the walk surface underfoot. */
export const EYE_HEIGHT = 1.6;

/** Walkable gallery floor surface Y (foyer surface + raise). */
export function gallerySurfaceY(): number {
  return FLOOR_SURFACE_Y + GALLERY_FLOOR_RAISE;
}

/** Box-floor center Y so the top face lands on gallerySurfaceY(). */
export function galleryFloorCenterY(): number {
  return FLOOR_Y + GALLERY_FLOOR_RAISE;
}

/** Wall slab bottom Y for raised gallery rooms. */
export function galleryWallBottomY(): number {
  return FLOOR_Y + GALLERY_FLOOR_RAISE;
}

/** Inter-room passage width (overrides narrow catalog connection values). */
export const DEFAULT_DOOR_WIDTH = 4.0;
/** Clear opening under doorway lintel relative to gallery wall bottom. */
export const DOOR_CLEAR_HEIGHT = 2.55;
export const SKY_PANORAMA_URL = "/sky/cozy-sky-night_2k.png";
export const MAX_PIXEL_RATIO = 2;

/** Slightly darker than WALL_COLOR so floors read as a distinct ground plane. */
export const FLOOR_COLOR = 0x6e7278;
export const WALL_COLOR = 0xadb0b8;
/** CSS hex mirrors of FLOOR_COLOR / WALL_COLOR for layout persistence. */
export const FLOOR_COLOR_HEX = "#6e7278";
export const WALL_COLOR_HEX = "#adb0b8";
