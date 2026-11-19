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
 * Exact Q rule:
 * 1) bookletOwned → Minecraft FP map raise/lower (never art HUD modal).
 * 2) !bookletOwned + art focused (look-at or selected) → compact bottom-sheet HUD.
 * 3) Else pedestal pickup when near.
 *
 * `selectedArtworkId` covers View/fullscreen where look-at sync is frozen but
 * the painting chrome still has a selected piece.
 */
export function resolveExhibitionQAction(opts: {
  focusedArtworkId: string | null;
  selectedArtworkId?: string | null;
  owned: boolean;
  nearPedestal: boolean;
}): ExhibitionQAction | null {
  if (opts.owned) {
    return { kind: "entrance", action: "toggle" };
  }
  const artId = opts.focusedArtworkId || opts.selectedArtworkId || null;
  if (artId) {
    return { kind: "art-booklet", artworkId: artId };
  }
  const action = resolveBookletKeyAction({
    owned: false,
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

/**
 * Minecraft FP inventory-map size (meters). Kept small so raised height
 * stays ~25–35% of a 70° vertical FOV at the raised forward distance.
 */
export const HELD_MAP_PLANE = { width: 0.3, height: 0.225 } as const;

/** Gallery FP camera vertical FOV (degrees) — matches gallery-scene-3d. */
export const HELD_MAP_CAMERA_FOV_DEG = 70;

/**
 * Fraction of vertical FOV covered by the held map height at a forward distance.
 * Used to keep the raised map Minecraft-item sized (target band 0.25–0.35).
 */
export function heldMapFovHeightFraction(
  distance: number,
  opts?: { height?: number; scale?: number; fovDeg?: number },
): number {
  const height = opts?.height ?? HELD_MAP_PLANE.height;
  const scale = opts?.scale ?? 1;
  const fovDeg = opts?.fovDeg ?? HELD_MAP_CAMERA_FOV_DEG;
  if (!(distance > 0) || !(fovDeg > 0)) return 0;
  const halfH = (height * scale) / 2;
  const angularDeg = (2 * Math.atan(halfH / distance) * 180) / Math.PI;
  return angularDeg / fovDeg;
}

/**
 * Camera-local poses. `position.z` is distance in front of the camera
 * (Three.js looks down −Z; callers must place at local (x, y, −z)).
 */
/** Raised (reading) — bottom-right FP item, face-on enough to read. */
export const HELD_BOOKLET_RAISED: HeldBookletLocalPose = {
  position: { x: 0.2, y: -0.16, z: 0.58 },
  eulerDeg: { x: 12, y: -8, z: 4 },
};

/** Lowered (stowed in hands) — farther corner, more edge-on. */
export const HELD_BOOKLET_LOWERED: HeldBookletLocalPose = {
  position: { x: 0.26, y: -0.34, z: 0.52 },
  eulerDeg: { x: 72, y: -14, z: 10 },
};

/** Mesh scale while raising (slight grow; must stay ≤ ~35% FOV height). */
export const HELD_MAP_SCALE_LOWERED = 0.88;
export const HELD_MAP_SCALE_RAISED = 1;

/** Local pose for the in-view held booklet; raised sits higher in camera space. */
export function heldBookletLocalPose(raised: boolean): HeldBookletLocalPose {
  return raised ? HELD_BOOKLET_RAISED : HELD_BOOKLET_LOWERED;
}

/** Blend raised↔lowered for Minecraft-like raise/lower motion (t in 0…1). */
export function lerpHeldBookletPose(t: number): HeldBookletLocalPose {
  const a = HELD_BOOKLET_LOWERED;
  const b = HELD_BOOKLET_RAISED;
  const u = Math.min(1, Math.max(0, t));
  if (u <= 0) return a;
  if (u >= 1) return b;
  return {
    position: {
      x: a.position.x + (b.position.x - a.position.x) * u,
      y: a.position.y + (b.position.y - a.position.y) * u,
      z: a.position.z + (b.position.z - a.position.z) * u,
    },
    eulerDeg: {
      x: a.eulerDeg.x + (b.eulerDeg.x - a.eulerDeg.x) * u,
      y: a.eulerDeg.y + (b.eulerDeg.y - a.eulerDeg.y) * u,
      z: a.eulerDeg.z + (b.eulerDeg.z - a.eulerDeg.z) * u,
    },
  };
}

function wrapCanvasLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let line = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const next = `${line} ${words[i]}`;
    if (ctx.measureText(next).width <= maxWidth) {
      line = next;
    } else {
      lines.push(line);
      line = words[i]!;
    }
  }
  lines.push(line);
  return lines;
}

/** Draw entrance booklet page onto a parchment canvas for the FP held map. */
export function paintHeldMapPage(
  canvas: HTMLCanvasElement,
  opts: { title: string; body: string; pageLabel?: string },
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = "#e4d2a6";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#cbb888";
  const edge = Math.max(10, Math.round(h * 0.018));
  ctx.fillRect(0, 0, w, edge);
  ctx.fillRect(0, h - edge, w, edge);
  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = Math.max(3, w * 0.01);
  ctx.strokeRect(8, 8, w - 16, h - 16);

  const pad = w * 0.09;
  const maxW = w - pad * 2;
  ctx.fillStyle = "#2a1c0e";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  // Compact title — map is a small FP item; avoid giant “Exhibition” fill.
  ctx.font = `bold ${Math.round(w * 0.042)}px Georgia, "Times New Roman", serif`;
  const titleLines = wrapCanvasLines(ctx, opts.title || "Map", maxW).slice(0, 2);
  let y = pad;
  const titleStep = w * 0.055;
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += titleStep;
  }
  y += w * 0.018;
  ctx.font = `${Math.round(w * 0.032)}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = "#3d2a14";
  const bodyLines = wrapCanvasLines(ctx, opts.body || "", maxW);
  const lineH = w * 0.042;
  const maxBodyY = h - pad - (opts.pageLabel ? lineH * 1.4 : 0);
  for (const line of bodyLines) {
    if (y + lineH > maxBodyY) break;
    ctx.fillText(line, pad, y);
    y += lineH;
  }
  if (opts.pageLabel) {
    ctx.font = `${Math.round(w * 0.028)}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = "#6a542e";
    ctx.textAlign = "right";
    ctx.fillText(opts.pageLabel, w - pad, h - pad * 0.85);
  }
}
