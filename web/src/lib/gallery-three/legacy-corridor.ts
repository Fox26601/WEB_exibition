import * as THREE from "three";
import { ROOM, roomLength } from "@/lib/room";
import { FLOOR_SURFACE_Y, WALL_THICKNESS } from "./constants";
import { makeFloorMaterial, makeWallMaterial } from "./layout-builder";

export type CorridorBuildResult = {
  length: number;
  root: THREE.Group;
  dispose: () => void;
};

export function buildLegacyCorridor(artworkCount: number): CorridorBuildResult {
  const length = roomLength(artworkCount);
  const root = new THREE.Group();
  const floorMat = makeFloorMaterial();
  const wallMat = makeWallMaterial();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, length),
    floorMat,
  );
  floor.name = "CorridorFloor";
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_SURFACE_Y, length / 2);
  root.add(floor);

  const wallH = ROOM.height;
  const mkWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.position.set(x, y, z);
    root.add(m);
  };

  mkWall(WALL_THICKNESS, wallH, length, -ROOM.width / 2, wallH / 2, length / 2);
  mkWall(WALL_THICKNESS, wallH, length, ROOM.width / 2, wallH / 2, length / 2);

  const doorW = 2.4;
  const side = (ROOM.width - doorW) * 0.5;
  if (side > 0.05) {
    mkWall(side, wallH, WALL_THICKNESS, -(doorW * 0.5 + side * 0.5), wallH / 2, 0);
    mkWall(side, wallH, WALL_THICKNESS, doorW * 0.5 + side * 0.5, wallH / 2, 0);
    const lintelH = Math.max(0.2, wallH - 2.6);
    mkWall(doorW, lintelH, WALL_THICKNESS, 0, 2.6 + lintelH * 0.5, 0);
  }

  mkWall(ROOM.width, wallH, WALL_THICKNESS, 0, wallH / 2, length);

  return {
    length,
    root,
    dispose: () => {
      root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) mesh.geometry?.dispose();
      });
      floorMat.dispose();
      wallMat.dispose();
    },
  };
}

export function corridorWalkClamp(
  pos: THREE.Vector3,
  length: number,
): void {
  pos.x = THREE.MathUtils.clamp(
    pos.x,
    -ROOM.width / 2 + 0.5,
    ROOM.width / 2 - 0.5,
  );
  pos.z = THREE.MathUtils.clamp(pos.z, 0.5, length - 0.5);
  pos.y = 1.6;
}