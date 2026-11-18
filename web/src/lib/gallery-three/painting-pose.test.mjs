import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import test from "node:test";
import { normalizeLayout } from "../catalog-types.ts";
import { syncPaintingYaws } from "../placement-eval.ts";
import {
  layoutOverlapRooms,
  wallSpansForEdge,
} from "../room-overlap-clip.ts";
import { placementWorldPoint } from "../placement-eval.ts";
import { paintingPoseFromPlacement } from "./painting-pose.ts";
import { roomWorldVertices } from "../layout-geometry.ts";
import { inwardNormal, roomCentroid } from "./room-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "prod-catalog.fixture.json"), "utf8"),
);

test("sample-03 keeps admin tAlongEdge (no runtime re-snap)", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  const p = layout.placements.find((x) => x.artworkId === "sample-03");
  assert.ok(p);
  const overlap = layoutOverlapRooms(layout);
  const spans = wallSpansForEdge(overlap, p.roomId, p.wallEdgeIndex);
  assert.ok(spans.length >= 2);
  const editorPt = placementWorldPoint(p, layout);
  const pose = paintingPoseFromPlacement(p, layout);
  assert.ok(editorPt && pose);
  assert.ok(
    Math.hypot(pose.position.x - editorPt.x, pose.position.z - editorPt.z) <
      0.12,
    "pose uses catalog edge point + inset only",
  );
});

test("painting pose Y follows placement wallHeightT", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  const base = layout.placements.find((x) => x.kind === "painting");
  assert.ok(base);
  const low = paintingPoseFromPlacement(
    { ...base, wallHeightT: 0.2 },
    layout,
  );
  const high = paintingPoseFromPlacement(
    { ...base, wallHeightT: 0.8 },
    layout,
  );
  assert.ok(low && high);
  assert.ok(high.position.y > low.position.y);
  assert.ok(Math.abs(high.position.y / low.position.y - 4) < 0.05);
});

test("painting pose sits slightly inward from wall edge", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  for (const p of layout.placements) {
    if (p.kind !== "painting") continue;
    const pose = paintingPoseFromPlacement(p, layout);
    assert.ok(pose, p.artworkId);
    const room = layout.rooms.find((r) => r.id === p.roomId);
    const verts = roomWorldVertices(room);
    const c = roomCentroid(verts);
    const i =
      ((p.wallEdgeIndex % verts.length) + verts.length) % verts.length;
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    const inward = inwardNormal(a, b, c);
    const along = placementWorldPoint(p, layout);
    assert.ok(along);
    const inset = Math.hypot(pose.position.x - along.x, pose.position.z - along.z);
    assert.ok(
      Math.abs(inset - 0.08) < 0.02,
      `${p.artworkId} inset ${inset}`,
    );
    const dot =
      inward.x * Math.sin(pose.yawRad) + inward.z * Math.cos(pose.yawRad);
    assert.ok(dot > 0.9, `${p.artworkId} faces inward (dot=${dot})`);
  }
});