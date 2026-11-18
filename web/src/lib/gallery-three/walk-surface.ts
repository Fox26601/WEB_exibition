import {
  EYE_HEIGHT,
  GALLERY_FLOOR_RAISE,
} from "./constants";

export type WalkAabb = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

/** World-space climb band from generated stairs / landing. */
export type ClimbBand = WalkAabb & {
  surfaceY: number;
};

function pointInAabb(x: number, z: number, b: WalkAabb): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;
}

export type WalkSurfaceSampleOptions = {
  climbBands?: ClimbBand[];
  /** Gallery rooms / corridor footprint at raised floor. */
  galleryBounds?: WalkAabb | null;
  galleryRaise?: number;
};

/**
 * Pure walk-surface sampler: matching climb bands win (highest surfaceY);
 * otherwise gallery AABB → GALLERY_FLOOR_RAISE; else foyer → 0.
 * Bands take priority so padded gallery AABBs cannot skip lower treads.
 */
export function sampleWalkSurfaceY(
  x: number,
  z: number,
  options: WalkSurfaceSampleOptions = {},
): number {
  const raise = options.galleryRaise ?? GALLERY_FLOOR_RAISE;
  const bands = options.climbBands ?? [];
  let bandY: number | null = null;
  for (const band of bands) {
    if (pointInAabb(x, z, band)) {
      bandY = bandY == null ? band.surfaceY : Math.max(bandY, band.surfaceY);
    }
  }
  if (bandY != null) return bandY;

  if (options.galleryBounds && pointInAabb(x, z, options.galleryBounds)) {
    return raise;
  }

  return 0;
}

/** Camera eye Y for a world XZ position. */
export function sampleEyeY(
  x: number,
  z: number,
  options: WalkSurfaceSampleOptions = {},
): number {
  return EYE_HEIGHT + sampleWalkSurfaceY(x, z, options);
}
