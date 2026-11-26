import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildEntranceModule,
  computeEntrancePose,
  ENTRANCE_ARCH_HEIGHT,
  ENTRANCE_ARCH_WIDTH,
  ENTRANCE_SCHEMATIC_DEPTH,
  ENTRANCE_WORLD_DEPTH,
  localRectToWorldAabb,
  unionWalkBounds,
} from "./entrance-builder.ts";
import {
  DOOR_CLEAR_HEIGHT,
  GALLERY_FLOOR_RAISE,
  STEP_COUNT,
  STEP_RISE,
  galleryWallClearHeight,
  galleryWallTopY,
} from "./constants.ts";
import { ENTRANCE_WIDTH } from "../layout-geometry.ts";

describe("computeEntrancePose", () => {
  it("places portal on +local Z of schematic center and spawn in corridor", () => {
    // Center at −half schematic so portal lands at world origin (gallery door).
    const pose = computeEntrancePose({
      x: 0,
      z: -ENTRANCE_SCHEMATIC_DEPTH * 0.5,
      rotation: 0,
    });
    assert.ok(Math.abs(pose.portal.x) < 1e-9);
    assert.ok(Math.abs(pose.portal.z) < 1e-9);
    assert.ok(Math.abs(pose.spawn.x) < 1e-9);
    assert.ok(
      Math.abs(pose.spawn.z - -(ENTRANCE_WORLD_DEPTH - 1.35)) < 1e-6,
    );
  });

  it("rotates portal offset for 90° yaw", () => {
    const pose = computeEntrancePose({ x: 2, z: 4, rotation: 90 });
    // halfDepth = ENTRANCE_SCHEMATIC_DEPTH/2; portal = (2 - half, 4)
    const half = ENTRANCE_SCHEMATIC_DEPTH * 0.5;
    assert.ok(Math.abs(pose.portal.x - (2 - half)) < 1e-6);
    assert.ok(Math.abs(pose.portal.z - 4) < 1e-6);
  });
});

describe("unionWalkBounds", () => {
  it("merges two AABBs", () => {
    const u = unionWalkBounds(
      { minX: 0, maxX: 2, minZ: 0, maxZ: 2 },
      { minX: -3, maxX: 1, minZ: -4, maxZ: 0.5 },
    );
    assert.equal(u.minX, -3);
    assert.equal(u.maxX, 2);
    assert.equal(u.minZ, -4);
    assert.equal(u.maxZ, 2);
  });
});

describe("buildEntranceModule stairs", () => {
  it("always emits STEP_COUNT steps and climbBands; landing only when layout empty", () => {
    const catalog = { settings: {}, artworks: [] };
    const empty = buildEntranceModule(null, catalog, {
      entrancePose: { x: 0, z: -ENTRANCE_SCHEMATIC_DEPTH * 0.5, rotation: 0 },
    });

    const stepNames = [];
    empty.root.traverse((obj) => {
      if (obj.name?.startsWith("EntranceStep")) stepNames.push(obj.name);
    });
    assert.equal(stepNames.length, STEP_COUNT);
    assert.ok(empty.root.getObjectByName("EntranceLanding"));

    assert.equal(empty.climbBands.length, STEP_COUNT + 1);
    for (let i = 0; i < STEP_COUNT; i++) {
      assert.equal(empty.climbBands[i].surfaceY, (i + 1) * STEP_RISE);
    }
    assert.equal(
      empty.climbBands[STEP_COUNT].surfaceY,
      GALLERY_FLOOR_RAISE,
    );
    // Top tread pulled short of the portal plane (local z=0 → world portal z).
    assert.ok(empty.climbBands[STEP_COUNT - 1].maxZ < empty.climbBands[STEP_COUNT].minZ + 1e-9);

    assert.equal(ENTRANCE_ARCH_WIDTH, ENTRANCE_WIDTH);
    empty.dispose();
  });

  it("omits coplanar landing mesh when gallery rooms exist", () => {
    const catalog = { settings: {}, artworks: [] };
    const layout = {
      version: 1,
      rooms: [
        {
          id: "r1",
          shape: "square",
          transform: { x: 0, z: 4, rotation: 0, scaleX: 2, scaleZ: 2 },
        },
      ],
      connections: [],
      placements: [],
      entrance: { x: 0, z: -ENTRANCE_SCHEMATIC_DEPTH * 0.5, rotation: 0 },
    };
    const built = buildEntranceModule(layout, catalog);
    assert.equal(built.root.getObjectByName("EntranceLanding"), undefined);
    assert.equal(built.climbBands.length, STEP_COUNT + 1);
    built.dispose();
  });

  it("maps local stair rects into world AABB under yaw", () => {
    const aabb = localRectToWorldAabb({ x: 0, z: 0 }, 0, -1, 1, -0.35, 0);
    assert.ok(aabb.minX <= -1 && aabb.maxX >= 1);
    assert.ok(aabb.minZ <= -0.35 && aabb.maxZ >= 0);
  });

  it("keeps arch and wall clear height usable at doubled raise", () => {
    assert.equal(GALLERY_FLOOR_RAISE, 1.08);
    assert.ok(Math.abs(ENTRANCE_ARCH_HEIGHT - (GALLERY_FLOOR_RAISE + 2.06)) < 1e-9);
    assert.ok(ENTRANCE_ARCH_HEIGHT - GALLERY_FLOOR_RAISE > 2);
    assert.ok(galleryWallClearHeight() > DOOR_CLEAR_HEIGHT);
    assert.ok(galleryWallTopY() > GALLERY_FLOOR_RAISE + DOOR_CLEAR_HEIGHT);
  });
});
