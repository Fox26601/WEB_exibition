import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { normalizeLayout } from "./catalog-types.ts";
import { syncPaintingYaws } from "./placement-eval.ts";
import {
  edgePoints,
  entranceWorldVertices,
  roomWorldVertices,
} from "./layout-geometry.ts";
import { placementWorldPoint } from "./placement-eval.ts";
import {
  editorPlanOrigin,
  editorSvgToWorld,
  worldToEditorSvg,
} from "./layout-editor-projection.ts";
import { evaluateLayoutEditorParity } from "./layout-editor-parity.ts";
import { paintingPoseFromPlacement } from "./gallery-three/painting-pose.ts";
import { WALL_INSET } from "./gallery-three/constants.ts";
import { inwardNormal, roomCentroid } from "./gallery-three/room-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(
    join(here, "gallery-three/prod-catalog.fixture.json"),
    "utf8",
  ),
);

test("prod fixture: admin projection round-trips room vertices", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  const origin = editorPlanOrigin(layout.rooms, layout.entrance);
  for (const room of layout.rooms) {
    for (const v of roomWorldVertices(room)) {
      const svg = worldToEditorSvg(v, origin);
      const back = editorSvgToWorld(svg.x, svg.y, origin);
      assert.ok(
        Math.hypot(back.x - v.x, back.z - v.z) < 1e-5,
        `${room.id} vertex drift`,
      );
    }
  }
  for (const v of entranceWorldVertices(layout.entrance)) {
    const svg = worldToEditorSvg(v, origin);
    const back = editorSvgToWorld(svg.x, svg.y, origin);
    assert.ok(Math.hypot(back.x - v.x, back.z - v.z) < 1e-5, "entrance drift");
  }
});

test("prod fixture: editor placement dots match 3D along-edge + inset", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  for (const p of layout.placements) {
    if (p.kind !== "painting") continue;
    const editorPt = placementWorldPoint(p, layout);
    const pose = paintingPoseFromPlacement(p, layout);
    assert.ok(editorPt && pose, p.artworkId);
    const room = layout.rooms.find((r) => r.id === p.roomId);
    const verts = roomWorldVertices(room);
    const edge =
      ((p.wallEdgeIndex % verts.length) + verts.length) % verts.length;
    const [a, b] = edgePoints(verts, edge);
    const inward = inwardNormal(a, b, roomCentroid(verts));
    const expected = {
      x: editorPt.x + inward.x * WALL_INSET,
      z: editorPt.z + inward.z * WALL_INSET,
    };
    const drift = Math.hypot(
      pose.position.x - expected.x,
      pose.position.z - expected.z,
    );
    assert.ok(drift < 0.025, `${p.artworkId} drift ${drift}`);
  }
});

test("prod fixture: layout editor parity report is clean", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  const report = evaluateLayoutEditorParity(layout);
  if (!report.ok) {
    console.error(report.issues);
  }
  assert.ok(report.ok, report.issues.map((i) => i.detail).join("; "));
});