import assert from "node:assert/strict";
import test from "node:test";
import { ENTRANCE_ROOM_ID } from "./catalog-types.ts";
import {
  entranceAsRoom,
  nextEntranceRotation,
  nextRoomRotation,
  softSnapRoom,
  softSnapRoomTranslate,
  squareRotationParallelToEdge,
} from "./layout-geometry.ts";

test("nextRoomRotation steps by shape", () => {
  assert.equal(nextRoomRotation("square", 0), 45);
  assert.equal(nextRoomRotation("square", 315), 0);
  assert.equal(nextRoomRotation("triangle", 0), 90);
  assert.equal(nextRoomRotation("hexagon", 270), 0);
  assert.equal(nextEntranceRotation(0), 90);
  assert.equal(nextEntranceRotation(270), 0);
});

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

test("tap rotation preserved — lockRotation uses translate only", () => {
  const hex = {
    id: "hex",
    shape: "hexagon",
    transform: { x: 0, z: -4, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
  };
  const triangle = {
    id: "tri",
    shape: "triangle",
    transform: { x: 0, z: 0, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
  };
  const square = {
    id: "sq",
    shape: "square",
    transform: { x: 3, z: 2, rotation: 45, scaleX: 3.2, scaleZ: 3.2 },
  };
  const snapped = softSnapRoom(square, [hex, triangle], { lockRotation: true });
  assert.equal(
    ((snapped.room.transform.rotation ?? 0) % 360 + 360) % 360,
    45,
  );
});

test("square drag assist aligns to hex edge azimuth", () => {
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
  assert.equal(plain.snappedTo, null);
  const rot = ((assisted.room.transform.rotation ?? 0) % 360 + 360) % 360;
  assert.notEqual(rot, 0, `assist should rotate square, got ${rot}`);
});

test("square drag snap to triangle slant uses 60° not fuzzy 45", () => {
  const triangle = {
    id: "tri",
    shape: "triangle",
    transform: { x: 0, z: 0, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
  };
  const square = {
    id: "sq",
    shape: "square",
    transform: { x: -0.6, z: 1.0, rotation: 0, scaleX: 3.2, scaleZ: 3.2 },
  };
  const assisted = softSnapRoom(square, [triangle]);
  assert.ok(assisted.snappedTo, "slant snap expected");
  assert.equal(assisted.snappedTo.roomId, "tri");
  const rot = ((assisted.room.transform.rotation ?? 0) % 360 + 360) % 360;
  const parallel60 =
    Math.abs(rot - 60) <= 1 ||
    Math.abs(rot - (-30 + 360)) <= 1 ||
    Math.abs(rot - 120) <= 1 ||
    Math.abs(rot - 240) <= 1;
  assert.ok(parallel60, `triangle slant parallel ~60°/120°, got ${rot}`);
  assert.equal(squareRotationParallelToEdge(0, 60), 330);
  assert.equal(squareRotationParallelToEdge(40, 60), 60);
});

test("entrance portal snap is not overridden by square rotation assist", () => {
  const entrance = entranceAsRoom({ x: 0, z: -2, rotation: 0 });
  // Fixed moderate scale near portal — covers assist vs foyer, not default span.
  const square = {
    id: "sq",
    shape: "square",
    transform: {
      x: -0.2,
      z: 2.4,
      rotation: 0,
      scaleX: 3.2,
      scaleZ: 3.2,
    },
  };
  const snapped = softSnapRoom(square, [entrance]);
  assert.equal(snapped.snappedTo?.roomId, ENTRANCE_ROOM_ID);
  assert.equal(snapped.room.transform.rotation ?? 0, square.transform.rotation ?? 0);
});
