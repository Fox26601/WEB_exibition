import { ROOM } from "@/lib/room";

export const GALLERY_HEIGHT = ROOM.height;
export const WALL_THICKNESS = 0.18;
/**
 * Doorway / portal passage depth — one stair-step thicker than walls so
 * seam artifacts at wall joints stay hidden inside the opening volume.
 * (STEP_RISE is defined below; keep numeric form here to avoid TDZ.)
 */
export const DOORWAY_PASSAGE_THICKNESS = WALL_THICKNESS + 0.18;
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

/** Foyer stair count into the raised gallery (6 × STEP_RISE = 2× original rise). */
export const STEP_COUNT = 6;
/** Vertical rise per stair tread (meters) — building-code-ish riser. */
export const STEP_RISE = 0.18;
/**
 * Horizontal depth per stair tread along entrance local −Z (meters).
 * Slightly tighter than 0.35 so the 6-step run fits a human-scale vestibule.
 */
export const STEP_DEPTH = 0.3;
/** Distance from foyer back wall to spawn (along corridor into portal). */
export const ENTRANCE_SPAWN_FROM_BACK = 1.2;
/** Gallery walk surface above foyer floor (= top tread). */
export const GALLERY_FLOOR_RAISE = STEP_COUNT * STEP_RISE;
/** Thin landing slab on the gallery side of the portal (local +Z). */
export const PORTAL_LANDING_DEPTH = 0.3;
/**
 * Pull stair treads toward foyer so the top step stops short of the portal
 * plane (avoids coplanar z-fight with room floor / landing at the doorway).
 */
export const STAIR_PORTAL_GAP = 0.04;
/**
 * Inset room floor along the entrance doorway (gallery-local +Z) so floor
 * tris stop before the portal plane and do not skin through stair treads.
 */
export const PORTAL_FLOOR_INSET = 0.02;
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

/** Gallery wall clear height from raised floor (matches unraised room height). */
export function galleryWallClearHeight(): number {
  return Math.max(0.18, GALLERY_HEIGHT - FLOOR_Y);
}

/** Absolute Y of gallery wall tops (rises with GALLERY_FLOOR_RAISE). */
export function galleryWallTopY(): number {
  return galleryWallBottomY() + galleryWallClearHeight();
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
