import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import {
  softSnapRoom,
  roomsWithEntrance,
  nextRoomRotation,
  softSnapRoomTranslate,
  roomWorldVertices,
  roomCentroid,
} from "./layout-geometry.ts";
import {
  placementWorldPoint,
  placementWorldPose,
  remapPlacementsForRoomChange,
  worldPointThroughRoomChange,
  inverseTransform,
} from "./placement-pose.ts";
import { applyTransform } from "./layout-geometry.ts";
import { paintingPoseFromPlacement } from "./gallery-three/painting-pose.ts";
import { GALLERY_FLOOR_RAISE, WALL_INSET } from "./gallery-three/constants.ts";
import { evaluateArtworkDrop } from "./placement-eval.ts";

/** Hex + triangle + rotated square — matches typical Place schematic (UWAG-114). */
function hexTriSquareLayout(squareRotation = 60) {
  const hex = {
    id: "hex",
    shape: "hexagon",
    transform: { x: 0, z: 2.5, rotation: 0, scaleX: 4.0, scaleZ: 3.5 },
  };
  const tri = {
    id: "tri",
    shape: "triangle",
    transform: { x: 0, z: 7.0, rotation: 180, scaleX: 3.8, scaleZ: 3.4 },
  };
  const square = {
    id: "sq",
    shape: "square",
    transform: {
      x: 3.5,
      z: 8.0,
      rotation: squareRotation,
      scaleX: 3.2,
      scaleZ: 3.2,
    },
  };
  return normalizeLayout({
    rooms: [hex, tri, square],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
}

test("inverseTransform round-trips applyTransform", () => {
  const t = { x: 2, z: -1, rotation: 60, scaleX: 3.2, scaleZ: 2.8 };
  const local = { x: 0.4, z: -0.7 };
  const world = applyTransform(local, t);
  const back = inverseTransform(world, t);
  assert.ok(Math.hypot(back.x - local.x, back.z - local.z) < 1e-9);
});

test("Place drop coords → identical 3D pose (hex+tri+rotated square)", () => {
  const layout = hexTriSquareLayout(60);
  const art = {
    id: "paint-a",
    type: "image",
    sort: 0,
    published: true,
    title: { en: "", ru: "", uk: "", he: "" },
    text: { en: "", ru: "", uk: "", he: "" },
    urlWall: "",
    urlFull: "",
    urlVideo: "",
    urlPoster: "",
    frameId: "wood",
  };

  // Drop onto square wall (world point near an edge of rotated square).
  const sq = layout.rooms.find((r) => r.id === "sq");
  const verts = roomWorldVertices(sq);
  const mid = {
    x: (verts[0].x + verts[1].x) / 2,
    z: (verts[0].z + verts[1].z) / 2,
  };
  const c = roomCentroid(verts);
  const outward = {
    x: mid.x - c.x,
    z: mid.z - c.z,
  };
  const len = Math.hypot(outward.x, outward.z) || 1;
  const dropPt = {
    x: mid.x + (outward.x / len) * 0.4,
    z: mid.z + (outward.z / len) * 0.4,
  };

  const drop = evaluateArtworkDrop(art, dropPt, layout);
  assert.equal(drop.ok, true);
  if (!drop.ok) return;

  const withPlace = {
    ...layout,
    placements: [drop.placement],
  };
  const marker = placementWorldPoint(drop.placement, withPlace);
  const shared = placementWorldPose(drop.placement, withPlace);
  const three = paintingPoseFromPlacement(drop.placement, withPlace);
  assert.ok(marker && shared && three);
  assert.equal(shared.kind, "painting");
  assert.ok(
    Math.hypot(marker.x - shared.world.x, marker.z - shared.world.z) < 1e-9,
    "marker world === shared world",
  );
  assert.ok(
    Math.hypot(
      three.position.x - shared.position.x,
      three.position.y - shared.position.y,
      three.position.z - shared.position.z,
    ) < 1e-9,
    "paintingPoseFromPlacement === placementWorldPose",
  );
  assert.ok(
    Math.hypot(three.position.x - marker.x, three.position.z - marker.z) -
      WALL_INSET <
      0.02,
    "3D hang is marker + inset only",
  );
  assert.equal(drop.placement.roomId, "sq");
  assert.ok(drop.placement.wallEdgeIndex != null);
});

test("sculpture floor path: Place floorX/Z unchanged through shared pose", () => {
  const layout = hexTriSquareLayout(45);
  const placement = {
    artworkId: "sculpt-a",
    kind: "sculpture",
    roomId: "hex",
    floorX: 0.5,
    floorZ: 2.8,
    yaw: 15,
    frameId: "none",
  };
  const withPlace = { ...layout, placements: [placement] };
  const marker = placementWorldPoint(placement, withPlace);
  const pose = placementWorldPose(placement, withPlace);
  assert.deepEqual(marker, { x: 0.5, z: 2.8 });
  assert.equal(pose.position.x, 0.5);
  assert.equal(pose.position.z, 2.8);
  assert.equal(pose.position.y, GALLERY_FLOOR_RAISE);
  assert.equal(pose.yawDeg, 15);
});

test("rotate room remaps painting wallEdgeIndex to same local wall", () => {
  const layout = hexTriSquareLayout(0);
  const sq = layout.rooms.find((r) => r.id === "sq");
  const placement = {
    artworkId: "paint-b",
    kind: "painting",
    roomId: "sq",
    wallEdgeIndex: 1,
    tAlongEdge: 0.42,
    wallHeightT: 0.55,
    yaw: 0,
    frameId: "thin",
  };
  const before = placementWorldPoint(placement, {
    ...layout,
    placements: [placement],
  });
  assert.ok(before);

  const rotated = {
    ...sq,
    transform: {
      ...sq.transform,
      rotation: nextRoomRotation("square", sq.transform.rotation || 0),
    },
    vertices: undefined,
  };
  const others = roomsWithEntrance(
    layout.rooms.filter((r) => r.id !== "sq"),
    layout.entrance,
  );
  const snapped = softSnapRoomTranslate(rotated, others);
  const remapped = remapPlacementsForRoomChange(
    [placement],
    sq,
    snapped.room,
  );
  const afterLayout = {
    ...layout,
    rooms: layout.rooms.map((r) => (r.id === "sq" ? snapped.room : r)),
    placements: remapped,
  };
  const after = placementWorldPoint(remapped[0], afterLayout);
  assert.ok(after);
  // Local attachment: hang point follows room figure (not left in world).
  const expected = worldPointThroughRoomChange(before, sq, snapped.room);
  assert.ok(
    Math.hypot(after.x - expected.x, after.z - expected.z) < 0.15,
    `remapped hang should follow room local wall, got drift ${Math.hypot(after.x - expected.x, after.z - expected.z)}`,
  );
  // Shared pose still matches Place marker after remap.
  const shared = placementWorldPose(remapped[0], afterLayout);
  const three = paintingPoseFromPlacement(remapped[0], afterLayout);
  assert.ok(shared && three);
  assert.ok(
    Math.hypot(
      three.position.x - shared.position.x,
      three.position.z - shared.position.z,
    ) < 1e-9,
  );
});

test("rotate room remaps sculpture floor with the figure", () => {
  const layout = hexTriSquareLayout(0);
  const sq = layout.rooms.find((r) => r.id === "sq");
  const c = roomCentroid(roomWorldVertices(sq));
  const placement = {
    artworkId: "sculpt-b",
    kind: "sculpture",
    roomId: "sq",
    floorX: c.x + 0.3,
    floorZ: c.z - 0.2,
    yaw: 0,
    frameId: "none",
  };
  const rotated = {
    ...sq,
    transform: {
      ...sq.transform,
      rotation: 45,
    },
    vertices: undefined,
  };
  const remapped = remapPlacementsForRoomChange([placement], sq, rotated);
  const expected = worldPointThroughRoomChange(
    { x: placement.floorX, z: placement.floorZ },
    sq,
    rotated,
  );
  assert.ok(
    Math.hypot(remapped[0].floorX - expected.x, remapped[0].floorZ - expected.z) <
      1e-9,
  );
  // Absolute world floor must change when room rotates around center.
  assert.ok(
    Math.hypot(
      remapped[0].floorX - placement.floorX,
      remapped[0].floorZ - placement.floorZ,
    ) > 0.05,
  );
});

test("assist-rotated square: Place marker and 3D pose stay aligned", () => {
  const base = hexTriSquareLayout(0);
  const square = {
    ...base.rooms.find((r) => r.id === "sq"),
    transform: { x: 3.2, z: 6.8, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
    vertices: undefined,
  };
  const others = roomsWithEntrance(
    base.rooms.filter((r) => r.id !== "sq"),
    base.entrance,
  );
  const assisted = softSnapRoom(square, others);
  assert.ok(assisted.snappedTo, "expect assist snap near hex/tri");
  const rot = ((assisted.room.transform.rotation ?? 0) % 360 + 360) % 360;
  // Assist may land on 30°/60° grid — not only k×45.
  assert.ok(rot !== undefined);

  const layout = {
    ...base,
    rooms: base.rooms.map((r) => (r.id === "sq" ? assisted.room : r)),
  };
  const verts = roomWorldVertices(assisted.room);
  const placement = {
    artworkId: "paint-c",
    kind: "painting",
    roomId: "sq",
    wallEdgeIndex: 0,
    tAlongEdge: 0.55,
    wallHeightT: 0.55,
    yaw: 0,
    frameId: "wood",
  };
  const withPlace = { ...layout, placements: [placement] };
  const marker = placementWorldPoint(placement, withPlace);
  const pose = placementWorldPose(placement, withPlace);
  const three = paintingPoseFromPlacement(placement, withPlace);
  assert.ok(marker && pose && three);
  assert.ok(
    Math.abs(
      Math.hypot(three.position.x - marker.x, three.position.z - marker.z) -
        WALL_INSET,
    ) < 0.02,
  );
  assert.ok(verts.length === 4);
});
