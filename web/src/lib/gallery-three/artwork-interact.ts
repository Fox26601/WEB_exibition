import type * as THREE from "three";

/**
 * Max look-at / pick distance for artwork title hint + selection (meters).
 * Wider than Unity's legacy 8m so the label appears from a comfortable stand-off.
 */
export const ARTWORK_LOOK_DISTANCE = 14;

/** Click / tap interact uses the same reach as look-at. */
export const ARTWORK_INTERACT_DISTANCE = ARTWORK_LOOK_DISTANCE;

/** Invisible pick volume size (meters) — slightly larger than the visible frame. */
export const ARTWORK_PICK_SIZE = { x: 1.55, y: 1.55, z: 0.45 } as const;

export type ArtworkHitKind = "artwork" | "pedestal" | "none";

export type ResolvedArtworkHit = {
  kind: ArtworkHitKind;
  artworkId: string | null;
  distance: number;
};

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
  hit: { object: THREE.Object3D; distance: number } | null | undefined,
  maxDistance = ARTWORK_LOOK_DISTANCE,
): ResolvedArtworkHit {
  if (!hit || hit.distance > maxDistance) {
    return { kind: "none", artworkId: null, distance: hit?.distance ?? 0 };
  }
  const resolved = resolveHitObject(hit.object);
  return { ...resolved, distance: hit.distance };
}

/** First usable artwork hit in a raycast result list (skips pedestal). */
export function firstArtworkHit(
  hits: Array<{ object: THREE.Object3D; distance: number }>,
  maxDistance = ARTWORK_LOOK_DISTANCE,
): ResolvedArtworkHit {
  for (const hit of hits) {
    if (hit.distance > maxDistance) break;
    const resolved = resolveIntersection(hit, maxDistance);
    if (resolved.kind === "artwork" && resolved.artworkId) return resolved;
    if (resolved.kind === "pedestal") continue;
  }
  return { kind: "none", artworkId: null, distance: 0 };
}
