import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { normalizeLayout } from "../catalog-types.ts";
import { syncPaintingYaws } from "../placement-eval.ts";
import {
  posterCanvasOrientationForPlacement,
  posterCanvasOrientation,
} from "./poster-canvas-orientation.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(
  readFileSync(join(here, "prod-catalog.fixture.json"), "utf8"),
);
const layout = syncPaintingYaws(normalizeLayout(fixture.layout));

test("prod layout paintings use geometry-stable poster orientation", () => {
  for (const p of layout.placements.filter((x) => x.kind === "painting")) {
    assert.deepEqual(posterCanvasOrientationForPlacement(p, layout), {
      textureMirror: false,
      rotate180: false,
      flipV: true,
    });
  }
});

test("corridor slot fallback mirrors poster U", () => {
  assert.deepEqual(posterCanvasOrientation("sample-01"), {
    textureMirror: true,
    rotate180: false,
  });
});