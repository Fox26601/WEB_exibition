/** Shared room growth formula — admin schematic + Three.js + Unity must match. */
export const ROOM = {
  width: 8,
  height: 3.2,
  slotPitch: 3.0,
  marginEnds: 2.0,
} as const;

export function roomLength(artworkCount: number): number {
  const n = Math.max(0, artworkCount);
  if (n === 0) {
    return ROOM.marginEnds * 2;
  }
  const pairs = Math.ceil(n / 2);
  return ROOM.marginEnds * 2 + pairs * ROOM.slotPitch;
}

export interface SlotPose {
  index: number;
  wall: "left" | "right";
  z: number;
  x: number;
}

export function slotPose(index: number): SlotPose {
  const wall = index % 2 === 0 ? "left" : "right";
  const z =
    ROOM.marginEnds + Math.floor(index / 2) * ROOM.slotPitch + ROOM.slotPitch / 2;
  const x = wall === "left" ? -ROOM.width / 2 + 0.05 : ROOM.width / 2 - 0.05;
  return { index, wall, z, x };
}
