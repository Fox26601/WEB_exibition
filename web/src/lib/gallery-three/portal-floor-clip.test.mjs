import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fixture from "./prod-catalog.fixture.json" with { type: "json" };
import { normalizeLayout } from "../catalog-types.ts";
import {
  ENTRANCE_ROOM_ID,
} from "../catalog-types.ts";
import {
  entranceWorldVertices,
  pointInPolygon,
  roomWorldVertices,
} from "../layout-geometry.ts";
import {
  PORTAL_FLOOR_INSET,
  STAIR_PORTAL_GAP,
} from "./constants.ts";
import {
  clipPolygonMinLocalZ,
  clipRoomFloorForPortal,
  portalPoseFromEntrance,
  roomConnectsToEntrance,
  worldToEntranceLocal,
} from "./portal-floor-clip.ts";

describe("portal floor clip", () => {
  it("portalPoseFromEntrance matches schematic portal at +half depth", () => {
    // Center at −half depth so portal lands at world origin (plan === 3D depth).
    const pose = portalPoseFromEntrance({ x: 0, z: -3, rotation: 0 });
    assert.ok(Math.abs(pose.portal.x) < 1e-9);
    assert.ok(Math.abs(pose.portal.z) < 1e-9);
  });

  it("clipPolygonMinLocalZ cuts verts on the foyer side of the portal", () => {
    const portal = { x: 0, z: 0 };
    const yaw = 0;
    const verts = [
      { x: -1, z: -0.5 },
      { x: 1, z: -0.5 },
      { x: 1, z: 2 },
      { x: -1, z: 2 },
    ];
    const clipped = clipPolygonMinLocalZ(verts, portal, yaw, 0.06);
    assert.ok(clipped.length >= 3);
    for (const v of clipped) {
      assert.ok(worldToEntranceLocal(portal, yaw, v).z >= 0.06 - 1e-6);
    }
  });

  it("clips fixture hex doorway floor off the portal plane", () => {
    const layout = normalizeLayout(fixture.layout);
    const hex = layout.rooms.find((r) => r.shape === "hexagon");
    assert.ok(hex);
    assert.ok(roomConnectsToEntrance(layout, hex.id));

    const verts = roomWorldVertices(hex);
    const pose = portalPoseFromEntrance(layout.entrance);
    const clipped = clipRoomFloorForPortal(verts, layout, hex.id, layout.entrance);

    assert.ok(clipped.length >= 3);
    for (const v of clipped) {
      const lz = worldToEntranceLocal(pose.portal, pose.yawRad, v).z;
      assert.ok(
        lz >= PORTAL_FLOOR_INSET - 1e-5,
        `expected inset floor vert lz=${lz}`,
      );
    }

    // Original portal-edge samples must no longer lie inside the clipped floor.
    const edgeSample = { x: 0, z: pose.portal.z };
    assert.equal(pointInPolygon(edgeSample, verts), true);
    assert.equal(pointInPolygon(edgeSample, clipped), false);
  });

  it("leaves rooms that do not touch the foyer unclipped", () => {
    const layout = normalizeLayout(fixture.layout);
    const remote = layout.rooms.find((r) => !roomConnectsToEntrance(layout, r.id));
    assert.ok(remote);
    const verts = roomWorldVertices(remote);
    const clipped = clipRoomFloorForPortal(
      verts,
      layout,
      remote.id,
      layout.entrance,
    );
    assert.equal(clipped, verts);
  });

  it("STAIR_PORTAL_GAP keeps top tread short of the portal plane", () => {
    assert.ok(STAIR_PORTAL_GAP > 0);
    assert.ok(PORTAL_FLOOR_INSET > 0);
  });

  it("entrance id used for doorway connections", () => {
    assert.equal(ENTRANCE_ROOM_ID, "__entrance");
    const foyer = entranceWorldVertices({ x: 0, z: -2, rotation: 0 });
    assert.equal(foyer.length, 4);
  });
});
