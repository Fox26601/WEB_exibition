import { ROOM } from "@/lib/room";

export const GALLERY_HEIGHT = ROOM.height;
export const WALL_THICKNESS = 0.18;
/** Painting offset from wall edge (Unity WallSnapUtility.WallInset). */
export const WALL_INSET = 0.08;
/** Interior wall plane offset from edge (Unity RoomBuilder.WallPlaneBias). */
export const WALL_PLANE_BIAS = 0.002;
/** Extend each wall span along its edge so slabs overlap cleanly at corners. */
export const WALL_CORNER_MITER = 0.52;
export const CANVAS_Z_OFFSET = 0.045;
export const FLOOR_Y = -0.05;
export const FLOOR_THICKNESS = 0.1;
/** Inter-room passage width (overrides narrow catalog connection values). */
export const DEFAULT_DOOR_WIDTH = 4.0;
/** Clear opening under doorway lintel (world Y). */
export const DOOR_CLEAR_HEIGHT = 2.55;
export const SKY_PANORAMA_URL = "/sky/cozy-sky-night_2k.png";
export const MAX_PIXEL_RATIO = 2;

export const FLOOR_COLOR = 0x85888c;
export const WALL_COLOR = 0xadb0b8;