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
 * 2) !bookletOwned + art focused → compact bottom-sheet HUD (keep).
 * 3) Else pedestal pickup when near.
 */
export function resolveExhibitionQAction(opts: {
  focusedArtworkId: string | null;
  owned: boolean;
  nearPedestal: boolean;
}): ExhibitionQAction | null {
  if (opts.owned) {
    return { kind: "entrance", action: "toggle" };
  }
  if (opts.focusedArtworkId) {
    return { kind: "art-booklet", artworkId: opts.focusedArtworkId };
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
 * Camera-local poses. `position.z` is distance in front of the camera
 * (Three.js looks down −Z; callers must place at local (x, y, −z)).
 */
/** Raised (reading) — closer to face, near face-on. */
export const HELD_BOOKLET_RAISED: HeldBookletLocalPose = {
  position: { x: 0.04, y: -0.04, z: 0.36 },
  eulerDeg: { x: 8, y: -3, z: 2 },
};

/** Lowered (stowed in hands) — farther / lower, more edge-on. */
export const HELD_BOOKLET_LOWERED: HeldBookletLocalPose = {
  position: { x: 0.28, y: -0.38, z: 0.48 },
  eulerDeg: { x: 68, y: -16, z: 10 },
};

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
  ctx.fillRect(0, 0, w, 18);
  ctx.fillRect(0, h - 18, w, 18);
  ctx.strokeStyle = "#8b6914";
  ctx.lineWidth = Math.max(4, w * 0.012);
  ctx.strokeRect(10, 10, w - 20, h - 20);

  const pad = w * 0.08;
  const maxW = w - pad * 2;
  ctx.fillStyle = "#2a1c0e";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `bold ${Math.round(w * 0.065)}px Georgia, "Times New Roman", serif`;
  const titleLines = wrapCanvasLines(ctx, opts.title || "Map", maxW).slice(0, 2);
  let y = pad;
  for (const line of titleLines) {
    ctx.fillText(line, pad, y);
    y += w * 0.08;
  }
  y += w * 0.02;
  ctx.font = `${Math.round(w * 0.042)}px Georgia, "Times New Roman", serif`;
  ctx.fillStyle = "#3d2a14";
  const bodyLines = wrapCanvasLines(ctx, opts.body || "", maxW);
  const lineH = w * 0.055;
  const maxBodyY = h - pad - (opts.pageLabel ? lineH * 1.4 : 0);
  for (const line of bodyLines) {
    if (y + lineH > maxBodyY) break;
    ctx.fillText(line, pad, y);
    y += lineH;
  }
  if (opts.pageLabel) {
    ctx.font = `${Math.round(w * 0.035)}px Georgia, "Times New Roman", serif`;
    ctx.fillStyle = "#6a542e";
    ctx.textAlign = "right";
    ctx.fillText(opts.pageLabel, w - pad, h - pad * 0.85);
  }
}
