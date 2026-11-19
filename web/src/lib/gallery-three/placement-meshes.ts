import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { Artwork, ArtworkPlacement, Catalog, GalleryLayout } from "@/lib/catalog-types";
import { ENTRANCE_ROOM_ID } from "@/lib/catalog-types";
import { slotPose } from "@/lib/room";
import {
  applyTextureToMaterial,
  loadColorTexture,
  orientGalleryPosterTexture,
  flipGalleryPosterTextureV,
} from "./texture-load";
import { CANVAS_Z_OFFSET } from "./constants";
import { ARTWORK_PICK_SIZE, SCULPTURE_PICK_SIZE } from "./artwork-interact";
import {
  posterCanvasOrientation,
  posterCanvasOrientationForPlacement,
} from "./poster-canvas-orientation";
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
      const group = buildPaintingGroup(
        art,
        placement,
        pose,
        layout,
        loader,
        disposables,
      );
      scene.add(group);
      pickRoots.push(group);
    } else if (placement.kind === "sculpture") {
      const pose = sculpturePoseFromPlacement(placement);
      if (!pose) continue;
      const group = buildSculptureGroup(art, pose, disposables);
      scene.add(group);
      pickRoots.push(group);
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
  layout: GalleryLayout,
  _loader: THREE.TextureLoader,
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
    frame.userData.artworkId = art.id;
    group.add(frame);
  }

  // Invisible volume so look-at / click stay reliable from stand-off distance.
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  disposables.push(pickMat);
  const pickProxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      ARTWORK_PICK_SIZE.x,
      ARTWORK_PICK_SIZE.y,
      ARTWORK_PICK_SIZE.z,
    ),
    pickMat,
  );
  pickProxy.userData.artworkId = art.id;
  pickProxy.userData.isPickProxy = true;
  group.add(pickProxy);

  const canvasMat = new THREE.MeshBasicMaterial({
    color: 0x9a958e,
    side: THREE.DoubleSide,
    toneMapped: true,
  });
  disposables.push(canvasMat);
  const orient = posterCanvasOrientationForPlacement(placement, layout);
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), canvasMat);
  canvas.position.z = CANVAS_Z_OFFSET;
  if (orient.rotate180) canvas.rotation.y = Math.PI;
  canvas.userData.artworkId = art.id;
  canvas.userData.isCanvas = true;
  group.add(canvas);

  const texUrl = art.urlWall || art.urlFull || art.urlPoster;
  if (texUrl) {
    void loadColorTexture(texUrl).then((tex) => {
      if (!tex) return;
      if (orient.flipV) flipGalleryPosterTextureV(tex);
      else if (orient.textureMirror) orientGalleryPosterTexture(tex);
      applyTextureToMaterial(canvasMat, tex);
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

function buildSculptureGroup(
  art: Artwork,
  pose: NonNullable<ReturnType<typeof sculpturePoseFromPlacement>>,
  disposables: Array<THREE.Material | THREE.Texture>,
): THREE.Group {
  const group = new THREE.Group();
  // Feet on raised gallery floor (same surface visitors walk on).
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.rotation.y = (pose.yawDeg * Math.PI) / 180;
  group.userData.artworkId = art.id;
  group.userData.isSculpture = true;

  // Invisible volume so look-at / E / Q stay reliable before/while GLB loads.
  const pickMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  disposables.push(pickMat);
  const pickProxy = new THREE.Mesh(
    new THREE.BoxGeometry(
      SCULPTURE_PICK_SIZE.x,
      SCULPTURE_PICK_SIZE.y,
      SCULPTURE_PICK_SIZE.z,
    ),
    pickMat,
  );
  pickProxy.position.y = SCULPTURE_PICK_SIZE.y * 0.5;
  pickProxy.userData.artworkId = art.id;
  pickProxy.userData.isPickProxy = true;
  pickProxy.userData.isSculpture = true;
  group.add(pickProxy);

  const placeholderMat = new THREE.MeshStandardMaterial({
    color: 0x6a6258,
    roughness: 0.85,
  });
  disposables.push(placeholderMat);
  const placeholder = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.9, 0.5),
    placeholderMat,
  );
  placeholder.position.y = 0.45;
  placeholder.userData.artworkId = art.id;
  placeholder.userData.isSculpture = true;
  group.add(placeholder);

  const modelUrl = art.modelUrl?.trim();
  if (!modelUrl) return group;

  const loader = new GLTFLoader();
  loader.load(
    modelUrl,
    (gltf) => {
      const model = gltf.scene;
      // Fit model into ~1m tall footprint on the floor.
      const box = new THREE.Box3().setFromObject(model);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      const scale = 1.1 / maxDim;
      model.scale.setScalar(scale);
      box.setFromObject(model);
      const center = new THREE.Vector3();
      box.getCenter(center);
      model.position.x -= center.x;
      model.position.z -= center.z;
      model.position.y -= box.min.y;
      model.traverse((obj) => {
        obj.userData.artworkId = art.id;
        obj.userData.isSculpture = true;
      });
      group.remove(placeholder);
      placeholder.geometry.dispose();
      placeholderMat.dispose();
      group.add(model);
    },
    undefined,
    () => {
      /* keep placeholder */
    },
  );

  return group;
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
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.4, 0.08), frameMat);
    frame.userData.artworkId = art.id;
    group.add(frame);

    const pickMat = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    disposables.push(pickMat);
    const pickProxy = new THREE.Mesh(
      new THREE.BoxGeometry(
        ARTWORK_PICK_SIZE.x,
        ARTWORK_PICK_SIZE.y,
        ARTWORK_PICK_SIZE.z,
      ),
      pickMat,
    );
    pickProxy.userData.artworkId = art.id;
    pickProxy.userData.isPickProxy = true;
    group.add(pickProxy);

    const canvasMat = new THREE.MeshBasicMaterial({
      color: 0x9a958e,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
    disposables.push(canvasMat);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), canvasMat);
    canvas.position.z = CANVAS_Z_OFFSET;
    canvas.userData.artworkId = art.id;
    canvas.userData.isCanvas = true;
    group.add(canvas);

    const texUrl = art.urlWall || art.urlFull || art.urlPoster;
    if (texUrl) {
      void loadColorTexture(texUrl).then((tex) => {
        if (!tex) return;
        const orient = posterCanvasOrientation(art.id);
        if (orient.textureMirror) orientGalleryPosterTexture(tex);
        applyTextureToMaterial(canvasMat, tex);
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