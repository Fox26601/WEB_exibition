/** Horizontal reach (meters) for pedestal pickup via Q. */
export const PEDESTAL_INTERACT_RADIUS = 2.25;

export function isWithinPedestalReach(
  camX: number,
  camZ: number,
  pedX: number,
  pedZ: number,
  radius = PEDESTAL_INTERACT_RADIUS,
): boolean {
  const dx = camX - pedX;
  const dz = camZ - pedZ;
  return dx * dx + dz * dz <= radius * radius;
}

/**
 * Minecraft-style booklet key: Q raises/lowers when owned;
 * otherwise Q only picks up while standing at the pedestal.
 */
export function resolveBookletKeyAction(opts: {
  owned: boolean;
  nearPedestal: boolean;
}): "pickup" | "toggle" | null {
  if (opts.owned) return "toggle";
  if (opts.nearPedestal) return "pickup";
  return null;
}

export type ExhibitionQAction =
  | { kind: "art-booklet"; artworkId: string }
  | { kind: "entrance"; action: "pickup" | "toggle" };

/**
 * Q routing: focused art toggles that piece's booklet (raise/lower);
 * otherwise foyer pedestal pickup/toggle. Works while fullscreen is open.
 */
export function resolveExhibitionQAction(opts: {
  focusedArtworkId: string | null;
  owned: boolean;
  nearPedestal: boolean;
}): ExhibitionQAction | null {
  if (opts.focusedArtworkId) {
    return { kind: "art-booklet", artworkId: opts.focusedArtworkId };
  }
  const action = resolveBookletKeyAction({
    owned: opts.owned,
    nearPedestal: opts.nearPedestal,
  });
  if (!action) return null;
  return { kind: "entrance", action };
}

/** Camera-local offset for the held map quad (meters). */
export type HeldBookletLocalPose = {
  position: { x: number; y: number; z: number };
  /** Euler degrees applied after camera rotation (X, Y, Z). */
  eulerDeg: { x: number; y: number; z: number };
};

/** Raised (looking at map) vs lowered (stowed in hands) — mirrors Unity BookletController. */
export const HELD_BOOKLET_RAISED: HeldBookletLocalPose = {
  position: { x: 0.22, y: -0.18, z: 0.55 },
  eulerDeg: { x: 65, y: -12, z: 8 },
};

export const HELD_BOOKLET_LOWERED: HeldBookletLocalPose = {
  position: { x: 0.28, y: -0.32, z: 0.45 },
  eulerDeg: { x: 78, y: -12, z: 8 },
};

/** Local pose for the in-view held booklet; raised sits higher in camera space. */
export function heldBookletLocalPose(raised: boolean): HeldBookletLocalPose {
  return raised ? HELD_BOOKLET_RAISED : HELD_BOOKLET_LOWERED;
}
