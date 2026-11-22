import * as THREE from "three";
import type { PresencePose, RemotePresencePose } from "./types";

const CAPSULE_COLOR = 0xc4a574;
const CAPSULE_RADIUS = 0.28;
const CAPSULE_LENGTH = 0.9;
/** Eye height offset so capsule sits on the floor under the head. */
const BODY_Y_OFFSET = 0.85;

export type RemoteAvatarHandle = {
  root: THREE.Group;
  target: PresencePose;
  current: PresencePose;
};

/**
 * Simple capsule avatar for a remote peer. Ignore self — only call for remotes.
 */
export function createRemoteAvatar(
  pose: PresencePose,
  actorNr: number,
): RemoteAvatarHandle {
  const root = new THREE.Group();
  root.name = `presence-remote-${actorNr}`;

  const geo = new THREE.CapsuleGeometry(CAPSULE_RADIUS, CAPSULE_LENGTH, 4, 8);
  const mat = new THREE.MeshStandardMaterial({
    color: CAPSULE_COLOR,
    roughness: 0.65,
    metalness: 0.05,
  });
  const body = new THREE.Mesh(geo, mat);
  body.castShadow = false;
  body.receiveShadow = false;
  root.add(body);

  const handle: RemoteAvatarHandle = {
    root,
    target: { ...pose },
    current: { ...pose },
  };
  applyPose(handle, pose, 1);
  return handle;
}

export function disposeRemoteAvatar(handle: RemoteAvatarHandle): void {
  handle.root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      const mat = obj.material;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat.dispose();
    }
  });
  handle.root.removeFromParent();
}

function applyPose(handle: RemoteAvatarHandle, pose: PresencePose, alpha: number): void {
  const c = handle.current;
  c.x = THREE.MathUtils.lerp(c.x, pose.x, alpha);
  c.y = THREE.MathUtils.lerp(c.y, pose.y, alpha);
  c.z = THREE.MathUtils.lerp(c.z, pose.z, alpha);
  // Shortest-path yaw lerp
  let dy = pose.yaw - c.yaw;
  while (dy > Math.PI) dy -= Math.PI * 2;
  while (dy < -Math.PI) dy += Math.PI * 2;
  c.yaw += dy * alpha;

  handle.root.position.set(c.x, c.y - BODY_Y_OFFSET, c.z);
  handle.root.rotation.set(0, c.yaw, 0);
}

/** Lerp all remotes toward their latest targets. */
export function tickRemoteAvatars(
  avatars: Map<number, RemoteAvatarHandle>,
  dt: number,
  lerpPerSec = 12,
): void {
  const alpha = 1 - Math.exp(-lerpPerSec * dt);
  for (const handle of avatars.values()) {
    applyPose(handle, handle.target, alpha);
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
