import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  HEADPHONES_ICON_SIZE,
  headphonesCornerPosition,
} from "./headphones-icon.ts";

const here = dirname(fileURLToPath(import.meta.url));

describe("headphones-icon", () => {
  it("places the marker at the lower-right outer frame corner", () => {
    const pos = headphonesCornerPosition(1.6, 1.2);
    assert.ok(pos.x > 0.8);
    assert.ok(pos.y < 0);
    assert.ok(pos.z > 0.1);
    assert.equal(pos.x, 1.6 * 0.5 + 0.02);
    assert.equal(pos.y, -(1.2 * 0.5) + HEADPHONES_ICON_SIZE * 0.45);
  });

  it("adapts when outer frame size changes", () => {
    const small = headphonesCornerPosition(0.8, 0.6);
    const large = headphonesCornerPosition(2.4, 1.8);
    assert.ok(large.x > small.x);
    assert.ok(large.y < small.y);
  });

  it("placement-meshes and gallery-scene use the icon helper, not a brown sphere", () => {
    const placement = readFileSync(join(here, "placement-meshes.ts"), "utf8");
    const scene = readFileSync(
      join(here, "../../components/exhibition/gallery-scene.tsx"),
      "utf8",
    );
    assert.match(placement, /createHeadphonesIconMesh/);
    assert.match(scene, /createHeadphonesIconMesh/);
    assert.doesNotMatch(placement, /SphereGeometry\(0\.12/);
    assert.doesNotMatch(scene, /SphereGeometry\(0\.12/);
  });
});
