import * as THREE from "three";

/** World size of the wall-mounted headphones marker (meters). */
export const HEADPHONES_ICON_SIZE = 0.32;

let sharedTexture: THREE.CanvasTexture | null = null;

/**
 * Draw a clear over-ear headphones glyph on a transparent canvas.
 * High-contrast so it reads at gallery stand-off distance.
 */
function paintHeadphonesIcon(ctx: CanvasRenderingContext2D, size: number): void {
  const cx = size / 2;
  const cy = size / 2;
  const s = size / 128;

  ctx.clearRect(0, 0, size, size);

  // Soft circular plate so the glyph stands out on dark or light walls.
  ctx.beginPath();
  ctx.arc(cx, cy, 54 * s, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(28, 24, 20, 0.72)";
  ctx.fill();
  ctx.lineWidth = 3 * s;
  ctx.strokeStyle = "rgba(245, 236, 220, 0.9)";
  ctx.stroke();

  const stroke = "#f5ecdc";
  const fill = "#e8dcc8";

  // Headband (upper arc).
  ctx.beginPath();
  ctx.arc(cx, cy + 6 * s, 34 * s, Math.PI * 1.12, Math.PI * 1.88);
  ctx.lineWidth = 7 * s;
  ctx.lineCap = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke();

  // Left ear cup.
  roundRect(ctx, cx - 42 * s, cy - 8 * s, 18 * s, 32 * s, 6 * s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = stroke;
  ctx.stroke();

  // Right ear cup.
  roundRect(ctx, cx + 24 * s, cy - 8 * s, 18 * s, 32 * s, 6 * s);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.stroke();

  // Inner cup pads (darker).
  roundRect(ctx, cx - 38 * s, cy - 2 * s, 10 * s, 20 * s, 4 * s);
  ctx.fillStyle = "rgba(40, 34, 28, 0.85)";
  ctx.fill();
  roundRect(ctx, cx + 28 * s, cy - 2 * s, 10 * s, 20 * s, 4 * s);
  ctx.fill();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

function getHeadphonesTexture(): THREE.CanvasTexture {
  if (sharedTexture) return sharedTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) paintHeadphonesIcon(ctx, size);
  sharedTexture = new THREE.CanvasTexture(canvas);
  sharedTexture.colorSpace = THREE.SRGBColorSpace;
  sharedTexture.needsUpdate = true;
  return sharedTexture;
}

export type HeadphonesIconHandle = {
  mesh: THREE.Mesh;
  /** Materials / textures to dispose with the placement group. */
  disposables: Array<THREE.Material | THREE.Texture>;
};

/**
 * Plane mesh with a headphones canvas glyph. Faces the gallery floor like the
 * painting canvas; raycast hits keep `userData.isHeadphones` for video open.
 */
export function createHeadphonesIconMesh(artworkId: string): HeadphonesIconHandle {
  const tex = getHeadphonesTexture();
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(HEADPHONES_ICON_SIZE, HEADPHONES_ICON_SIZE),
    mat,
  );
  mesh.userData.artworkId = artworkId;
  mesh.userData.isHeadphones = true;
  // Slightly in front of the frame face so the glyph is never clipped.
  mesh.renderOrder = 2;
  return { mesh, disposables: [mat] };
}

/** Lower-right corner of a painting outer box, slightly proud of the frame. */
export function headphonesCornerPosition(
  outerWidth: number,
  outerHeight: number,
): THREE.Vector3 {
  return new THREE.Vector3(
    outerWidth * 0.5 + 0.02,
    -(outerHeight * 0.5) + HEADPHONES_ICON_SIZE * 0.45,
    0.12,
  );
}
