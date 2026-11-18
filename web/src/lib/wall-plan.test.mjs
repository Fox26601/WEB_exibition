import assert from "node:assert/strict";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import {
  buildLayoutWallPlan,
  placementTCoveredByPlan,
  wallPlanSpansForEdge,
} from "./wall-plan.ts";

test("single room: one full exterior span per edge", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "r1",
        vertices: [
          { x: 0, z: 0 },
          { x: 3, z: 0 },
          { x: 3, z: 3 },
          { x: 0, z: 3 },
        ],
      },
    ],
    connections: [],
    placements: [],
    entrance: { x: 0, z: -1, rotation: 0 },
  });
  const plan = buildLayoutWallPlan(layout);
  const spans = wallPlanSpansForEdge(plan, "r1", 0);
  assert.equal(spans.length, 1);
  assert.ok(spans[0].t0 <= 0.01 && spans[0].t1 >= 0.99);
});

test("painting on interior edge gets snap_surface coverage in plan", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "hex",
        shape: "hexagon",
        transform: { x: 0, z: 2, rotation: 0, scaleX: 2.8, scaleZ: 2.8 },
      },
      {
        id: "sq",
        shape: "square",
        transform: { x: 0.5, z: 1.8, rotation: 45, scaleX: 2.2, scaleZ: 2.2 },
      },
    ],
    connections: [],
    placements: [
      {
        kind: "painting",
        roomId: "sq",
        wallEdgeIndex: 1,
        tAlongEdge: 0.42,
        artworkId: "art-a",
      },
    ],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const plan = buildLayoutWallPlan(layout);
  assert.ok(
    placementTCoveredByPlan(plan, "sq", 1, 0.42),
    "plan should cover painting t on clipped edge",
  );
});

test("shared doorway edge: higher roomId does not get a restored full shell", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "5312d4c1-4838-4f0c-9e00-588d6a4a4cf7",
        shape: "triangle",
        transform: {
          x: 0,
          z: 7.291576081150617,
          rotation: 180,
          scaleX: 3.854900488462868,
          scaleZ: 3.4239149305555556,
        },
      },
      {
        id: "bd4eb2e3-e595-4541-bc97-35aff02ce313",
        shape: "hexagon",
        transform: {
          x: 0,
          z: 2.5398093079364195,
          rotation: 0,
          scaleX: 4.463430026074119,
          scaleZ: 3.5100694444444445,
        },
      },
    ],
    connections: [
      {
        roomA: "5312d4c1-4838-4f0c-9e00-588d6a4a4cf7",
        roomB: "bd4eb2e3-e595-4541-bc97-35aff02ce313",
        edgeA: 1,
        edgeB: 1,
        doorwayWidth: 1.4,
      },
    ],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const plan = buildLayoutWallPlan(layout);
  const hexDoor = plan.segments.filter(
    (s) =>
      s.roomId === "bd4eb2e3-e595-4541-bc97-35aff02ce313" && s.edgeIndex === 1,
  );
  assert.equal(
    hexDoor.length,
    0,
    "hexagon shared edge must stay empty (no double wall)",
  );
  const triDoor = plan.segments.filter(
    (s) =>
      s.roomId === "5312d4c1-4838-4f0c-9e00-588d6a4a4cf7" && s.edgeIndex === 1,
  );
  assert.ok(triDoor.length >= 1, "triangle keeps the shared doorway wall");
});

test("connected square defers doorway shell to lower roomId partner", () => {
  const layout = normalizeLayout({
    rooms: [
      {
        id: "aaa-tri",
        shape: "triangle",
        transform: { x: 0, z: 4, rotation: 180, scaleX: 3, scaleZ: 3 },
      },
      {
        id: "zzz-sq",
        shape: "square",
        transform: { x: 2, z: 5, rotation: 30, scaleX: 2.5, scaleZ: 2.5 },
      },
    ],
    connections: [
      {
        roomA: "aaa-tri",
        roomB: "zzz-sq",
        edgeA: 2,
        edgeB: 0,
        doorwayWidth: 1.4,
      },
    ],
    placements: [],
    entrance: { x: 0, z: -2, rotation: 0 },
  });
  const plan = buildLayoutWallPlan(layout);
  assert.equal(
    plan.segments.filter((s) => s.roomId === "zzz-sq" && s.edgeIndex === 0)
      .length,
    0,
  );
  assert.ok(
    plan.segments.some((s) => s.roomId === "aaa-tri" && s.edgeIndex === 2),
  );
});