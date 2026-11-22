import * as THREE from "three";
import type { PresencePose, RemotePresencePose } from "./types";

const CORE_RADIUS = 0.11;
const GLOW_SPRITE_SIZE = 0.85;
const SHELL_RADIUS = 0.28;
const BOB_AMP = 0.07;
const BOB_HZ = 1.15;
const PULSE_AMP = 0.08;
const TRAIL_COUNT = 8;
const TRAIL_SPACING = 0.045;

/** Soft palette — distinct hues so remotes are easy to tell apart. */
const WISP_PALETTE = [
  0x7ecbff, // ice blue
  0xa8f0c0, // mint
  0xffd78a, // warm gold
  0xe8a0ff, // lilac
  0xff9eb5, // rose
  0x9ad7ff, // sky
  0xc5f29a, // spring
  0xffc4a0, // peach
];

export type RemoteAvatarHandle = {
  root: THREE.Group;
  target: PresencePose;
  current: PresencePose;
  /** Phase offset so nearby wisps don't bob in lockstep. */
  phase: number;
  color: number;
  coreMat: THREE.MeshStandardMaterial;
  shellMat: THREE.MeshBasicMaterial;
  glowMat: THREE.SpriteMaterial;
  trailMats: THREE.SpriteMaterial[];
  trailSprites: THREE.Sprite[];
  trailHistory: THREE.Vector3[];
};

let sharedGlowTexture: THREE.CanvasTexture | null = null;

/** Tiny radial soft-disc for additive glow / trail sprites. */
function getGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture) return sharedGlowTexture;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.35, "rgba(255,255,255,0.55)");
  g.addColorStop(0.7, "rgba(255,255,255,0.12)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  sharedGlowTexture = new THREE.CanvasTexture(canvas);
  sharedGlowTexture.needsUpdate = true;
  return sharedGlowTexture;
}

export function colorForActor(actorNr: number): number {
  const idx = Math.abs(actorNr | 0) % WISP_PALETTE.length;
  return WISP_PALETTE[idx]!;
}

/**
 * Warcraft-style floating wisp for a remote peer (not a humanoid/capsule).
 * Local player stays camera-only — only call this for remotes.
 */
export function createRemoteAvatar(
  pose: PresencePose,
  actorNr: number,
): RemoteAvatarHandle {
  const color = colorForActor(actorNr);
  const root = new THREE.Group();
  root.name = `presence-remote-${actorNr}`;

  const glowTex = getGlowTexture();

  const coreMat = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 2.4,
    roughness: 0.25,
    metalness: 0.05,
    transparent: true,
    opacity: 0.95,
  });
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(CORE_RADIUS, 16, 12),
    coreMat,
  );
  core.castShadow = false;
  core.receiveShadow = false;
  root.add(core);

  const shellMat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(SHELL_RADIUS, 16, 12),
    shellMat,
  );
  shell.castShadow = false;
  shell.receiveShadow = false;
  root.add(shell);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTex,
    color,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(GLOW_SPRITE_SIZE);
  root.add(glow);

  const trailSprites: THREE.Sprite[] = [];
  const trailMats: THREE.SpriteMaterial[] = [];
  const trailHistory: THREE.Vector3[] = [];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const t = i / TRAIL_COUNT;
    const mat = new THREE.SpriteMaterial({
      map: glowTex,
      color,
      transparent: true,
      opacity: 0.35 * (1 - t),
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const spr = new THREE.Sprite(mat);
    const s = GLOW_SPRITE_SIZE * (0.55 - t * 0.35);
    spr.scale.setScalar(s);
    spr.visible = false;
    root.add(spr);
    trailSprites.push(spr);
    trailMats.push(mat);
    trailHistory.push(new THREE.Vector3(pose.x, pose.y, pose.z));
  }

  const handle: RemoteAvatarHandle = {
    root,
    target: { ...pose },
    current: { ...pose },
    phase: (actorNr * 1.7) % (Math.PI * 2),
    color,
    coreMat,
    shellMat,
    glowMat,
    trailMats,
    trailSprites,
    trailHistory,
  };
  applyPose(handle, pose, 1, 0);
  return handle;
}

export function disposeRemoteAvatar(handle: RemoteAvatarHandle): void {
  handle.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
    }
  });
  handle.coreMat.dispose();
  handle.shellMat.dispose();
  handle.glowMat.dispose();
  for (const mat of handle.trailMats) mat.dispose();
  // Shared glow texture is kept for reuse across remotes.
  handle.root.removeFromParent();
}

function applyPose(
  handle: RemoteAvatarHandle,
  pose: PresencePose,
  alpha: number,
  timeSec: number,
): void {
  const c = handle.current;
  c.x = THREE.MathUtils.lerp(c.x, pose.x, alpha);
  c.y = THREE.MathUtils.lerp(c.y, pose.y, alpha);
  c.z = THREE.MathUtils.lerp(c.z, pose.z, alpha);
  let dy = pose.yaw - c.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  c.yaw += dy * alpha;

  const bob =
    Math.sin(timeSec * Math.PI * 2 * BOB_HZ + handle.phase) * BOB_AMP;
  const pulse =
    1 +
    Math.sin(timeSec * Math.PI * 2 * (BOB_HZ * 0.85) + handle.phase) *
      PULSE_AMP;

  // Float at remote eye height (pose.y) with a soft bob — not a floor capsule.
  // No yaw on root: spheres/sprites are omnidirectional; rotating would twist the trail.
  handle.root.position.set(c.x, c.y + bob, c.z);
  handle.root.scale.setScalar(pulse);

  handle.coreMat.emissiveIntensity = 2.1 + pulse * 0.6;
  handle.glowMat.opacity = 0.55 + pulse * 0.25;
  handle.shellMat.opacity = 0.12 + pulse * 0.08;

  // Short fading trail in world space (sprites parented to root → local offset).
  const hist = handle.trailHistory;
  const head = hist[0]!;
  const moved =
    Math.abs(head.x - c.x) + Math.abs(head.y - (c.y + bob)) + Math.abs(head.z - c.z);
  if (moved > TRAIL_SPACING) {
    for (let i = hist.length - 1; i > 0; i--) {
      hist[i]!.copy(hist[i - 1]!);
    }
    head.set(c.x, c.y + bob, c.z);
  }
  for (let i = 0; i < handle.trailSprites.length; i++) {
    const spr = handle.trailSprites[i]!;
    const p = hist[i]!;
    spr.position.set(p.x - c.x, p.y - (c.y + bob), p.z - c.z);
    spr.visible = i > 0;
  }
}

/** Lerp all remotes toward their latest targets and animate wisp bob/pulse. */
export function tickRemoteAvatars(
  avatars: Map<number, RemoteAvatarHandle>,
  dt: number,
  lerpPerSec = 12,
  timeSec = performance.now() / 1000,
): void {
  const alpha = 1 - Math.exp(-lerpPerSec * dt);
  for (const handle of avatars.values()) {
    applyPose(handle, handle.target, alpha, timeSec);
  }
}

export function syncRemoteAvatarMap(
  scene: THREE.Scene,
  avatars: Map<number, RemoteAvatarHandle>,
  remotes: RemotePresencePose[],
): void {
  const seen = new Set<number>();
  for (const remote of remotes) {
    seen.add(remote.actorNr);
    let handle = avatars.get(remote.actorNr);
    if (!handle) {
      handle = createRemoteAvatar(remote, remote.actorNr);
      avatars.set(remote.actorNr, handle);
      scene.add(handle.root);
    }
    handle.target = {
      x: remote.x,
      y: remote.y,
      z: remote.z,
      yaw: remote.yaw,
    };
  }
  for (const [actorNr, handle] of avatars) {
    if (seen.has(actorNr)) continue;
    disposeRemoteAvatar(handle);
    avatars.delete(actorNr);
  }
}

export function clearRemoteAvatars(
  avatars: Map<number, RemoteAvatarHandle>,
): void {
  for (const handle of avatars.values()) disposeRemoteAvatar(handle);
  avatars.clear();
}

/** Extract yaw (Y) from a camera quaternion using YXZ euler. */
export function yawFromCamera(camera: THREE.Camera, euler: THREE.Euler): number {
  euler.setFromQuaternion(camera.quaternion, "YXZ");
  return euler.y;
}
