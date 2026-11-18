import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeEntrancePose,
  ENTRANCE_SCHEMATIC_DEPTH,
  ENTRANCE_WORLD_DEPTH,
  unionWalkBounds,
} from "./entrance-builder.ts";

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
    // halfSchematic = 1.5; portal = (2 - 1.5, 4) = (0.5, 4)
    assert.ok(Math.abs(pose.portal.x - 0.5) < 1e-6);
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
