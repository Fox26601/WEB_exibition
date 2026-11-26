/**
 * Shared wall-painting outer/canvas size from media aspect.
 * Used by Three exhibition meshes and hang-band Y (admin PLACE + pose).
 */

export const PAINTING_LONG_SIDE = 1.4;
export const PAINTING_FRAME_DEPTH = 0.08;
/** Total inset (both sides) from outer frame to canvas plane. */
export const PAINTING_CANVAS_INSET = 0.2;
export const PAINTING_ASPECT_MIN = 0.35;
export const PAINTING_ASPECT_MAX = 2.8;
/** Clearance above floor / below wall top for hang band. */
export const PAINTING_HEIGHT_MARGIN = 0.1;

export type PaintingSize = { width: number; height: number };

/** width/height; missing or invalid → 1 (square). */
export function mediaAspect(input: {
  mediaWidth?: number | null;
  mediaHeight?: number | null;
}): number {
  const w = input.mediaWidth;
  const h = input.mediaHeight;
  if (
    w == null ||
    h == null ||
    !Number.isFinite(w) ||
    !Number.isFinite(h) ||
    w <= 0 ||
    h <= 0
  ) {
    return 1;
  }
  return w / h;
}

export function clampMediaAspect(aspect: number): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return Math.max(PAINTING_ASPECT_MIN, Math.min(PAINTING_ASPECT_MAX, aspect));
}

/** Outer frame size (meters) with long side ≈ PAINTING_LONG_SIDE. */
export function paintingOuterSize(aspect: number): PaintingSize {
  const a = clampMediaAspect(aspect);
  if (a >= 1) {
    return { width: PAINTING_LONG_SIDE, height: PAINTING_LONG_SIDE / a };
  }
  return { width: PAINTING_LONG_SIDE * a, height: PAINTING_LONG_SIDE };
}

export function paintingCanvasSize(outer: PaintingSize): PaintingSize {
  const inset = PAINTING_CANVAS_INSET;
  return {
    width: Math.max(0.2, outer.width - inset),
    height: Math.max(0.2, outer.height - inset),
  };
}

/** Default square outer when aspect unknown (matches legacy 1.4×1.4). */
export function defaultPaintingOuterSize(): PaintingSize {
  return paintingOuterSize(1);
}
