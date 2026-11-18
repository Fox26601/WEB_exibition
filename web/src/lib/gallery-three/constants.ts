import { ROOM } from "@/lib/room";

export const GALLERY_HEIGHT = ROOM.height;
export const WALL_THICKNESS = 0.12;
/** Painting offset from wall plane (Unity WallSnapUtility.WallInset). */
export const WALL_INSET = 0.08;
/** Extend each wall span along its edge so inset quads meet at corners. */
export const WALL_CORNER_MITER = 0.1;
export const CANVAS_Z_OFFSET = 0.045;
export const FLOOR_Y = -0.05;
export const FLOOR_THICKNESS = 0.1;
export const DEFAULT_DOOR_WIDTH = 2.4;
export const SKY_PANORAMA_URL = "/sky/cozy-sky-night_2k.png";
export const MAX_PIXEL_RATIO = 2;

export const FLOOR_COLOR = 0x85888c;
export const WALL_COLOR = 0xadb0b8;