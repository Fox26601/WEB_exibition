/** Default floor hex — matches FLOOR_COLOR 0x6e7278 (darker than walls). */
export const DEFAULT_FLOOR_COLOR_HEX = "#6e7278";
/** Default wall hex — matches WALL_COLOR 0xadb0b8. */
export const DEFAULT_WALL_COLOR_HEX = "#adb0b8";

/** Gallery-safe neutrals for Plan Surfaces swatches. */
export const ROOM_SURFACE_SWATCHES = [
  "#6e7278",
  "#85888c",
  "#adb0b8",
  "#9a8b78",
  "#5a6068",
  "#c4b8a8",
] as const;

const HEX6 = /^#([0-9a-fA-F]{6})$/;
const HEX3 = /^#([0-9a-fA-F]{3})$/;

/** Normalize to `#rrggbb` lowercase, or null if invalid. */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const m6 = HEX6.exec(trimmed);
  if (m6) return `#${m6[1].toLowerCase()}`;
  const m3 = HEX3.exec(trimmed);
  if (m3) {
    const [r, g, b] = m3[1].toLowerCase().split("");
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export function clampHexColor(
  value: unknown,
  fallback: string,
): string {
  return normalizeHexColor(value) ?? fallback;
}

export function parseHexToNumber(hex: string): number {
  const n = normalizeHexColor(hex);
  if (!n) return 0;
  return Number.parseInt(n.slice(1), 16);
}

/** Relative luminance 0..1 (sRGB). */
export function hexLuminance(hex: string): number {
  const n = parseHexToNumber(hex);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const lin = (c: number) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export type RoomSurfaceColors = {
  floorColor?: string | null;
  wallColor?: string | null;
};

export type PlanRoomSvgColors = {
  fill: string;
  stroke: string;
  labelFill: string;
};

/**
 * 2D plan colors from room surface fields.
 * Selection affordance is stroke weight / opacity in the editor, not fill override.
 */
export function planRoomSvgColors(
  room: RoomSurfaceColors | null | undefined,
  selected = false,
): PlanRoomSvgColors {
  const fill = clampHexColor(room?.floorColor, DEFAULT_FLOOR_COLOR_HEX);
  const stroke = clampHexColor(room?.wallColor, DEFAULT_WALL_COLOR_HEX);
  const labelFill = hexLuminance(fill) < 0.45 ? "#e8e4dc" : "#2a2620";
  void selected;
  return { fill, stroke, labelFill };
}

export function shapePreviewPoints(shape: string): string {
  switch (shape) {
    case "triangle":
      return "12,2 22,22 2,22";
    case "square":
      return "4,4 20,4 20,20 4,20";
    case "pentagon":
      return "12,2 22,10 18,22 6,22 2,10";
    case "hexagon":
      return "12,2 21,7 21,17 12,22 3,17 3,7";
    default:
      return "4,4 20,4 20,20 4,20";
  }
}
