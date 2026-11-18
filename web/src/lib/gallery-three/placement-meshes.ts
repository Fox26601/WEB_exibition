import * as THREE from "three";
import type { Artwork, ArtworkPlacement, Catalog, GalleryLayout } from "@/lib/catalog-types";
import { ENTRANCE_ROOM_ID } from "@/lib/catalog-types";
import { slotPose } from "@/lib/room";
import { loadColorTexture, resolveGalleryMediaUrl } from "./texture-load";
import { paintingPoseFromPlacement, sculpturePoseFromPlacement } from "./painting-pose";

const FRAME_COLORS: Record<string, number> = {
  thin: 0x1a140f,
  wood: 0x4a3524,
  metal: 0x555a60,
  ornate: 0x3d2a18,
  none: 0x111111,
};

export type PlacementMeshesResult = {
  pickRoots: THREE.Object3D[];
  dispose: () => void;
};

export function addPlacementsToScene(
  scene: THREE.Scene,
  catalog: Catalog,
  artworks: Artwork[],
  loader: THREE.TextureLoader,
): PlacementMeshesResult {
  const layout = catalog.layout;
  const placements = layout?.placements ?? [];
  const pickRoots: THREE.Object3D[] = [];
  const disposables: Array<THREE.Material | THREE.Texture> = [];
  const byId = new Map(artworks.map((a) => [a.id, a]));

  if (!layout || placements.length === 0) {
    return { pickRoots, dispose: () => undefined };
  }

  for (const placement of placements) {
    if (placement.roomId === ENTRANCE_ROOM_ID) continue;
    const art = byId.get(placement.artworkId);
    if (!art) continue;

    if (placement.kind === "painting") {
      const pose = paintingPoseFromPlacement(placement, layout);
      if (!pose) continue;
      const group = buildPaintingGroup(art, placement, pose, loader, disposables);
      scene.add(group);
      pickRoots.push(group);
    } else if (placement.kind === "sculpture") {
      const pose = sculpturePoseFromPlacement(placement);
      if (!pose) continue;
      const mesh = buildSculpturePlaceholder(art, pose);
      scene.add(mesh);
      pickRoots.push(mesh);
    }
  }

  return {
    pickRoots,
    dispose: () => {
      for (const d of disposables) {
        if ("dispose" in d && typeof d.dispose === "function") d.dispose();
      }
    },
  };
}

function buildPaintingGroup(
  art: Artwork,
  placement: ArtworkPlacement,
  pose: NonNullable<ReturnType<typeof paintingPoseFromPlacement>>,
  loader: THREE.TextureLoader,
  disposables: Array<THREE.Material | THREE.Texture>,
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.rotation.y = pose.yawRad;
  group.userData.artworkId = art.id;

  const frameColor = FRAME_COLORS[placement.frameId] ?? FRAME_COLORS.thin;
  const frameMat = new THREE.MeshStandardMaterial({
    color: placement.frameId === "none" ? 0x000000 : frameColor,
    roughness: 0.75,
    transparent: placement.frameId === "none",
    opacity: placement.frameId === "none" ? 0 : 1,
  });
  disposables.push(frameMat);

  if (placement.frameId !== "none") {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.4, 0.08),
      frameMat,
    );
    group.add(frame);
  }

  const canvasMat = new THREE.MeshStandardMaterial({
    color: 0x9a958e,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  disposables.push(canvasMat);
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), canvasMat);
  canvas.position.z = 0.05;
  canvas.userData.artworkId = art.id;
  canvas.userData.isCanvas = true;
  group.add(canvas);

  const texUrl = resolveGalleryMediaUrl(
    art.urlWall || art.urlFull || art.urlPoster,
  );
  if (texUrl) {
    loadColorTexture(loader, texUrl, (tex) => {
      canvasMat.map = tex;
      canvasMat.color.set(0xffffff);
      canvasMat.needsUpdate = true;
      disposables.push(tex);
    });
  }

  if (art.type === "video") {
    const hp = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xc4893a, roughness: 0.45 }),
    );
    hp.position.set(0.7, -0.55, 0.1);
    hp.userData.artworkId = art.id;
    hp.userData.isHeadphones = true;
    group.add(hp);
  }

  return group;
}

function buildSculpturePlaceholder(
  art: Artwork,
  pose: NonNullable<ReturnType<typeof sculpturePoseFromPlacement>>,
): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.85 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), mat);
  mesh.position.set(pose.position.x, 0.45, pose.position.z);
  mesh.rotation.y = (pose.yawDeg * Math.PI) / 180;
  mesh.userData.artworkId = art.id;
  return mesh;
}

/** Slot-based corridor paintings when layout has no placements. */
export function addCorridorArtworks(
  scene: THREE.Scene,
  artworks: Artwork[],
  loader: THREE.TextureLoader,
): PlacementMeshesResult {
  const pickRoots: THREE.Object3D[] = [];
  const disposables: Array<THREE.Material | THREE.Texture> = [];
  artworks.forEach((art, index) => {
    const pose = slotPose(index);
    const group = new THREE.Group();
    group.position.set(pose.x, 1.55, pose.z);
    group.rotation.y = pose.wall === "left" ? Math.PI / 2 : -Math.PI / 2;
    group.userData.artworkId = art.id;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a140f, roughness: 0.7 });
    disposables.push(frameMat);
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.08), frameMat));

    const canvasMat = new THREE.MeshStandardMaterial({
      color: 0x9a958e,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });
    disposables.push(canvasMat);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), canvasMat);
    canvas.position.z = 0.05;
    canvas.userData.artworkId = art.id;
    canvas.userData.isCanvas = true;
    group.add(canvas);

    const texUrl = resolveGalleryMediaUrl(
      art.urlWall || art.urlFull || art.urlPoster,
    );
    if (texUrl) {
      loadColorTexture(loader, texUrl, (tex) => {
        canvasMat.map = tex;
        canvasMat.color.set(0xffffff);
        canvasMat.needsUpdate = true;
        disposables.push(tex);
      });
    }

    if (art.type === "video") {
      const hp = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xc4893a }),
      );
      hp.position.set(0.7, -0.55, 0.1);
      hp.userData.artworkId = art.id;
      hp.userData.isHeadphones = true;
      group.add(hp);
    }

    scene.add(group);
    pickRoots.push(group);
  });

  return {
    pickRoots,
    dispose: () => {
      for (const d of disposables) d.dispose();
    },
  };
}