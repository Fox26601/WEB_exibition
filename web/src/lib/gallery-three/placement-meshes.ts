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
import { CANVAS_Z_OFFSET, GALLERY_FLOOR_RAISE } from "./constants";
import { ARTWORK_PICK_SIZE, SCULPTURE_PICK_SIZE } from "./artwork-interact";
import {
  wallMediaOrientation,
  wallMediaOrientationCorridor,
  type PosterCanvasOrientation,
} from "./poster-canvas-orientation";
import { paintingPoseFromPlacement, sculpturePoseFromPlacement } from "./painting-pose";
import { coerceSculptureFloorPlacement } from "./sculpture-seed";
import {
  createWallVideoTexture,
  wallVideoHasFrame,
  type WallVideoHandle,
} from "./wall-video";
import {
  PAINTING_FRAME_DEPTH,
  mediaAspect,
  paintingCanvasSize,
  paintingOuterSize,
} from "@/lib/painting-frame";

const FRAME_COLORS: Record<string, number> = {
  thin: 0x1a140f,
  wood: 0x4a3524,
  metal: 0x555a60,
  ornate: 0x3d2a18,
  none: 0x111111,
};

type MeshDisposable =
  | THREE.Material
  | THREE.Texture
  | WallVideoHandle
  | { dispose: () => void };

export type PlacementMeshesResult = {
  pickRoots: THREE.Object3D[];
  dispose: () => void;
};

function disposeMeshResources(list: MeshDisposable[]): void {
  for (const d of list) {
    if ("dispose" in d && typeof d.dispose === "function") d.dispose();
  }
}

function orientCanvasTexture(
  tex: THREE.Texture,
  orient: PosterCanvasOrientation,
): void {
  if (orient.flipY != null) tex.flipY = orient.flipY;
  if (orient.flipV) flipGalleryPosterTextureV(tex);
  else if (orient.textureMirror) orientGalleryPosterTexture(tex);
  tex.needsUpdate = true;
}

/**
 * Still poster first (avoids grey frame), then muted looping VideoTexture once a frame is ready.
 * Video uses a separate orientation (no still flipV).
 */
function bindPaintingCanvasMedia(
  art: Artwork,
  canvasMat: THREE.MeshBasicMaterial,
  stillOrient: PosterCanvasOrientation,
  videoOrient: PosterCanvasOrientation,
  disposables: MeshDisposable[],
  onMeasuredAspect?: (aspect: number) => void,
): void {
  const posterUrl =
    art.type === "video"
      ? art.urlPoster || art.urlWall || art.urlFull
      : art.urlWall || art.urlFull || art.urlPoster;
  let videoApplied = false;

  if (posterUrl) {
    void loadColorTexture(posterUrl).then((tex) => {
      if (!tex || videoApplied) return;
      orientCanvasTexture(tex, stillOrient);
      applyTextureToMaterial(canvasMat, tex);
      disposables.push(tex);
      const img = tex.image as { width?: number; height?: number } | undefined;
      if (img?.width && img?.height && onMeasuredAspect) {
        onMeasuredAspect(img.width / img.height);
      }
    });
  }

  if (art.type !== "video" || !art.urlVideo?.trim()) return;

  const handle = createWallVideoTexture(art.urlVideo.trim());
  if (!handle) return;
  disposables.push(handle);

  const applyVideo = () => {
    if (videoApplied) return;
    videoApplied = true;
    orientCanvasTexture(handle.texture, videoOrient);
    applyTextureToMaterial(canvasMat, handle.texture);
    const vw = handle.video.videoWidth;
    const vh = handle.video.videoHeight;
    if (vw > 0 && vh > 0 && onMeasuredAspect) {
      onMeasuredAspect(vw / vh);
    }
  };

  if (wallVideoHasFrame(handle.video)) {
    applyVideo();
  } else {
    handle.video.addEventListener("loadeddata", applyVideo, { once: true });
  }
}

function resizePaintingMeshes(
  frame: THREE.Mesh | null,
  canvas: THREE.Mesh,
  pickProxy: THREE.Mesh,
  headphones: THREE.Mesh | null,
  aspect: number,
): void {
  const outer = paintingOuterSize(aspect);
  const canvasSize = paintingCanvasSize(outer);
  if (frame) {
    frame.geometry.dispose();
    frame.geometry = new THREE.BoxGeometry(
      outer.width,
      outer.height,
      PAINTING_FRAME_DEPTH,
    );
  }
  canvas.geometry.dispose();
  canvas.geometry = new THREE.PlaneGeometry(canvasSize.width, canvasSize.height);
  pickProxy.geometry.dispose();
  pickProxy.geometry = new THREE.BoxGeometry(
    Math.max(ARTWORK_PICK_SIZE.x, outer.width + 0.15),
    Math.max(ARTWORK_PICK_SIZE.y, outer.height + 0.45),
    ARTWORK_PICK_SIZE.z,
  );
  if (headphones) {
    headphones.position.set(
      outer.width * 0.5 + 0.05,
      -(outer.height * 0.5) + 0.15,
      0.1,
    );
  }
}

export function addPlacementsToScene(
  scene: THREE.Scene,
  catalog: Catalog,
  artworks: Artwork[],
  loader: THREE.TextureLoader,
): PlacementMeshesResult {
  const layout = catalog.layout;
  const placements = layout?.placements ?? [];
  const pickRoots: THREE.Object3D[] = [];
  const disposables: MeshDisposable[] = [];
  const byId = new Map(artworks.map((a) => [a.id, a]));

  if (!layout || placements.length === 0) {
    return { pickRoots, dispose: () => undefined };
  }

  for (const placement of placements) {
    if (placement.roomId === ENTRANCE_ROOM_ID) continue;
    const art = byId.get(placement.artworkId);
    if (!art) continue;

    // type=model is always a floor volume — never the painting canvas path,
    // even if a legacy catalog row still says kind=painting + wallEdge.
    const asSculpture = art.type === "model" || placement.kind === "sculpture";
    if (asSculpture) {
      const floorPlacement = coerceSculptureFloorPlacement(placement, layout);
      const pose = sculpturePoseFromPlacement(floorPlacement);
      if (!pose) continue;
      const group = buildSculptureGroup(art, pose, disposables);
      scene.add(group);
      pickRoots.push(group);
      continue;
    }

    if (placement.kind !== "painting") continue;
    const outer = paintingOuterSize(mediaAspect(art));
    const pose = paintingPoseFromPlacement(placement, layout, outer.height);
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
  }

  return {
    pickRoots,
    dispose: () => disposeMeshResources(disposables),
  };
}

function buildPaintingGroup(
  art: Artwork,
  placement: ArtworkPlacement,
  pose: NonNullable<ReturnType<typeof paintingPoseFromPlacement>>,
  layout: GalleryLayout,
  _loader: THREE.TextureLoader,
  disposables: MeshDisposable[],
): THREE.Group {
  const group = new THREE.Group();
  group.position.set(pose.position.x, pose.position.y, pose.position.z);
  group.rotation.y = pose.yawRad;
  group.userData.artworkId = art.id;

  const outer = paintingOuterSize(mediaAspect(art));
  const canvasSize = paintingCanvasSize(outer);
  const catalogAspect = mediaAspect(art);

  const frameColor = FRAME_COLORS[placement.frameId] ?? FRAME_COLORS.thin;
  const frameMat = new THREE.MeshStandardMaterial({
    color: placement.frameId === "none" ? 0x000000 : frameColor,
    roughness: 0.75,
    transparent: placement.frameId === "none",
    opacity: placement.frameId === "none" ? 0 : 1,
  });
  disposables.push(frameMat);

  let frame: THREE.Mesh | null = null;
  if (placement.frameId !== "none") {
    frame = new THREE.Mesh(
      new THREE.BoxGeometry(outer.width, outer.height, PAINTING_FRAME_DEPTH),
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
      Math.max(ARTWORK_PICK_SIZE.x, outer.width + 0.15),
      Math.max(ARTWORK_PICK_SIZE.y, outer.height + 0.45),
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
  const stillOrient = wallMediaOrientation(placement, layout, "image");
  const videoOrient = wallMediaOrientation(placement, layout, "video");
  const canvas = new THREE.Mesh(
    new THREE.PlaneGeometry(canvasSize.width, canvasSize.height),
    canvasMat,
  );
  canvas.position.z = CANVAS_Z_OFFSET;
  if (stillOrient.rotate180) canvas.rotation.y = Math.PI;
  canvas.userData.artworkId = art.id;
  canvas.userData.isCanvas = true;
  group.add(canvas);

  let headphones: THREE.Mesh | null = null;
  if (art.type === "video") {
    headphones = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xc4893a, roughness: 0.45 }),
    );
    headphones.position.set(
      outer.width * 0.5 + 0.05,
      -(outer.height * 0.5) + 0.15,
      0.1,
    );
    headphones.userData.artworkId = art.id;
    headphones.userData.isHeadphones = true;
    group.add(headphones);
  }

  let appliedAspect = catalogAspect;
  bindPaintingCanvasMedia(
    art,
    canvasMat,
    stillOrient,
    videoOrient,
    disposables,
    (measured) => {
      if (!Number.isFinite(measured) || measured <= 0) return;
      if (Math.abs(measured - appliedAspect) < 0.02) return;
      appliedAspect = measured;
      resizePaintingMeshes(frame, canvas, pickProxy, headphones, measured);
    },
  );

  return group;
}

function buildSculptureGroup(
  art: Artwork,
  pose: NonNullable<ReturnType<typeof sculpturePoseFromPlacement>>,
  disposables: MeshDisposable[],
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
  const disposables: MeshDisposable[] = [];
  let sculptureSlot = 0;
  artworks.forEach((art, index) => {
    // Models are floor volumes on the raised gallery — never wall canvases.
    if (art.type === "model") {
      const pose = {
        position: {
          x: (sculptureSlot % 2 === 0 ? -0.9 : 0.9),
          y: GALLERY_FLOOR_RAISE,
          z: sculptureSlot * 1.6,
        },
        yawDeg: 20,
      };
      sculptureSlot += 1;
      const group = buildSculptureGroup(art, pose, disposables);
      scene.add(group);
      pickRoots.push(group);
      return;
    }

    const pose = slotPose(index);
    const outer = paintingOuterSize(mediaAspect(art));
    const canvasSize = paintingCanvasSize(outer);
    const group = new THREE.Group();
    group.position.set(pose.x, 1.55, pose.z);
    group.rotation.y = pose.wall === "left" ? Math.PI / 2 : -Math.PI / 2;
    group.userData.artworkId = art.id;

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a140f, roughness: 0.7 });
    disposables.push(frameMat);
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(outer.width, outer.height, PAINTING_FRAME_DEPTH),
      frameMat,
    );
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
        Math.max(ARTWORK_PICK_SIZE.x, outer.width + 0.15),
        Math.max(ARTWORK_PICK_SIZE.y, outer.height + 0.45),
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
    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(canvasSize.width, canvasSize.height),
      canvasMat,
    );
    canvas.position.z = CANVAS_Z_OFFSET;
    canvas.userData.artworkId = art.id;
    canvas.userData.isCanvas = true;
    group.add(canvas);

    let headphones: THREE.Mesh | null = null;
    if (art.type === "video") {
      headphones = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xc4893a }),
      );
      headphones.position.set(
        outer.width * 0.5 + 0.05,
        -(outer.height * 0.5) + 0.15,
        0.1,
      );
      headphones.userData.artworkId = art.id;
      headphones.userData.isHeadphones = true;
      group.add(headphones);
    }

    const stillOrient = wallMediaOrientationCorridor("image");
    const videoOrient = wallMediaOrientationCorridor(
      art.type === "video" ? "video" : "image",
    );
    let appliedAspect = mediaAspect(art);
    bindPaintingCanvasMedia(
      art,
      canvasMat,
      stillOrient,
      videoOrient,
      disposables,
      (measured) => {
        if (!Number.isFinite(measured) || measured <= 0) return;
        if (Math.abs(measured - appliedAspect) < 0.02) return;
        appliedAspect = measured;
        resizePaintingMeshes(frame, canvas, pickProxy, headphones, measured);
      },
    );

    scene.add(group);
    pickRoots.push(group);
  });

  return {
    pickRoots,
    dispose: () => disposeMeshResources(disposables),
  };
}