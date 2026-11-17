import assert from "node:assert/strict";
import test from "node:test";
import { ENTRANCE_ROOM_ID } from "./catalog-types.ts";
import {
  defaultRoomTransform,
  entranceAsRoom,
  softSnapRoom,
  softSnapRoomTranslate,
} from "./layout-geometry.ts";

test("square axis-aligned edge snaps to triangle flat edge", () => {
  const triangle = {
    id: "tri",
    shape: "triangle",
    transform: { x: 0, z: 0, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
  };
  const square = {
    id: "sq",
    shape: "square",
    transform: { x: 0, z: 3.05, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
  };
  const snapped = softSnapRoomTranslate(square, [triangle]);
  assert.ok(snapped.snappedTo, "expected translation snap");
  assert.equal(snapped.snappedTo.roomId, "tri");
  assert.ok(snapped.ownEdge >= 0);
});

test("square 45° rotation assist snaps diamond edge to hexagon", () => {
  const hexagon = {
    id: "hex",
    shape: "hexagon",
    transform: { x: 0, z: 0, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
  };
  const square = {
    id: "sq",
    shape: "square",
    transform: { x: 3.4, z: 2.2, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
  };
  const plain = softSnapRoomTranslate(square, [hexagon]);
  const assisted = softSnapRoom(square, [hexagon]);
  assert.ok(assisted.snappedTo, "rotation-assisted snap expected");
  assert.equal(assisted.snappedTo.roomId, "hex");
  const rot = ((assisted.room.transform.rotation ?? 0) % 360 + 360) % 360;
  assert.equal(rot, 45);
  assert.equal(plain.snappedTo, null);
});

test("entrance portal snap is not overridden by square rotation assist", () => {
  const entrance = entranceAsRoom({ x: 0, z: -3, rotation: 0 });
  const square = {
    id: "sq",
    shape: "square",
    transform: defaultRoomTransform("square", 0),
  };
  square.transform.x = -0.2;
  square.transform.z = 0.1;
  const snapped = softSnapRoom(square, [entrance]);
  assert.equal(snapped.snappedTo?.roomId, ENTRANCE_ROOM_ID);
  assert.equal(snapped.room.transform.rotation ?? 0, square.transform.rotation ?? 0);
});