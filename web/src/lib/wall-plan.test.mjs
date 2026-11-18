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