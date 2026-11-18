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
