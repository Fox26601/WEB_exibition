import type * as THREE from "three";

/**
 * Max look-at / pick distance for artwork title hint + selection (meters).
 * Full 3D reach (includes raised hang Y) — wider than Unity's legacy 8m and
 * the prior 14m so high wallHeightT paintings stay selectable from a normal
 * floor stand-off when looking up.
 */
export const ARTWORK_LOOK_DISTANCE = 20;

/** Click / tap interact uses the same reach as look-at. */
export const ARTWORK_INTERACT_DISTANCE = ARTWORK_LOOK_DISTANCE;

/** Invisible pick volume size (meters) — taller pad helps upward look-at. */
export const ARTWORK_PICK_SIZE = { x: 1.55, y: 1.85, z: 0.45 } as const;

export type ArtworkHitKind = "artwork" | "pedestal" | "none";

export type ResolvedArtworkHit = {
  kind: ArtworkHitKind;
  artworkId: string | null;
  distance: number;
};

export type Vec3Like = { x: number; y: number; z: number };

/** Squared Euclidean distance in world space (includes height). */
export function distanceSq3D(
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): number {
  const dx = ax - bx;
  const dy = ay - by;
  const dz = az - bz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * True when the camera is within radius of a target in full 3D (not XZ-only).
 * Pedestal pickup stays horizontal; artwork look/info must include raised Y.
 */
export function isWithinArtworkReach(
  camX: number,
  camY: number,
  camZ: number,
  targetX: number,
  targetY: number,
  targetZ: number,
  radius = ARTWORK_LOOK_DISTANCE,
): boolean {
  return distanceSq3D(camX, camY, camZ, targetX, targetY, targetZ) <= radius * radius;
}

/** 3D camera→point distance; falls back to ray `distance` when no point. */
export function artworkHitDistance3D(
  hit: { distance: number; point?: Vec3Like } | null | undefined,
  cam?: Vec3Like | null,
): number {
  if (!hit) return 0;
  if (cam && hit.point) {
    return Math.sqrt(
      distanceSq3D(cam.x, cam.y, cam.z, hit.point.x, hit.point.y, hit.point.z),
    );
  }
  return hit.distance;
}

/** Walk parents for artworkId / pedestal flags (no one-level parent hacks). */
export function resolveHitObject(
  obj: THREE.Object3D | null | undefined,
): ResolvedArtworkHit {
  if (!obj) return { kind: "none", artworkId: null, distance: 0 };

  let probe: THREE.Object3D | null = obj;
  let artworkId: string | null = null;
  let isPedestal = false;

  while (probe) {
    if (probe.userData?.isPedestal) isPedestal = true;
    if (!artworkId && typeof probe.userData?.artworkId === "string") {
      artworkId = probe.userData.artworkId;
    }
    probe = probe.parent;
  }

  if (isPedestal) return { kind: "pedestal", artworkId: null, distance: 0 };
  if (artworkId) return { kind: "artwork", artworkId, distance: 0 };
  return { kind: "none", artworkId: null, distance: 0 };
}

export function resolveIntersection(
  hit:
    | { object: THREE.Object3D; distance: number; point?: Vec3Like }
    | null
    | undefined,
  maxDistance = ARTWORK_LOOK_DISTANCE,
  cam?: Vec3Like | null,
): ResolvedArtworkHit {
  if (!hit) {
    return { kind: "none", artworkId: null, distance: 0 };
  }
  const distance = artworkHitDistance3D(hit, cam);
  if (distance > maxDistance) {
    return { kind: "none", artworkId: null, distance };
  }
  const resolved = resolveHitObject(hit.object);
  return { ...resolved, distance };
}

/** First usable artwork hit in a raycast result list (skips pedestal). */
export function firstArtworkHit(
  hits: Array<{ object: THREE.Object3D; distance: number; point?: Vec3Like }>,
  maxDistance = ARTWORK_LOOK_DISTANCE,
  cam?: Vec3Like | null,
): ResolvedArtworkHit {
  for (const hit of hits) {
    const distance = artworkHitDistance3D(hit, cam);
    if (distance > maxDistance) break;
    const resolved = resolveIntersection(hit, maxDistance, cam);
    if (resolved.kind === "artwork" && resolved.artworkId) return resolved;
    if (resolved.kind === "pedestal") continue;
  }
  return { kind: "none", artworkId: null, distance: 0 };
}
