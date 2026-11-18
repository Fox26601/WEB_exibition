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
import {
  paintingPoseFromPlacement,
  resolveTAlongWallSpan,
} from "./painting-pose.ts";
import { roomWorldVertices, edgePoints } from "../layout-geometry.ts";
import { inwardNormal, roomCentroid } from "./room-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "prod-catalog.fixture.json"), "utf8"),
);

test("overlap clip: painting t snaps onto visible wall span", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  const p = layout.placements.find((x) => x.artworkId === "sample-03");
  assert.ok(p);
  const overlap = layoutOverlapRooms(layout);
  const spans = wallSpansForEdge(overlap, p.roomId, p.wallEdgeIndex);
  assert.ok(spans.length >= 2);
  const inGap =
    p.tAlongEdge > spans[0].t1 + 0.01 && p.tAlongEdge < spans[1].t0 - 0.01;
  assert.ok(inGap, "fixture expects sample-03 t in overlap gap");
  const snapped = resolveTAlongWallSpan(
    p.roomId,
    p.wallEdgeIndex,
    p.tAlongEdge,
    layout,
  );
  assert.ok(snapped != null);
  const onSpan = spans.some(
    (s) => snapped >= s.t0 - 1e-6 && snapped <= s.t1 + 1e-6,
  );
  assert.ok(onSpan, `snapped t=${snapped} must lie on a visible span`);
});

test("painting pose sits slightly inward from wall edge", () => {
  const layout = syncPaintingYaws(normalizeLayout(fixture.layout));
  for (const p of layout.placements) {
    if (p.kind !== "painting") continue;
    const pose = paintingPoseFromPlacement(p, layout);
    assert.ok(pose, p.artworkId);
    const room = layout.rooms.find((r) => r.id === p.roomId);
    const verts = roomWorldVertices(room);
    const [a, b] = edgePoints(verts, p.wallEdgeIndex);
    const c = roomCentroid(verts);
    const inward = inwardNormal(a, b, c);
    const t = resolveTAlongWallSpan(p.roomId, p.wallEdgeIndex, p.tAlongEdge, layout);
    const along = {
      x: a.x + (b.x - a.x) * t,
      z: a.z + (b.z - a.z) * t,
    };
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