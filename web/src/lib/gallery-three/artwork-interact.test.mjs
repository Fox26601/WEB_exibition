import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTWORK_LOOK_DISTANCE,
  ARTWORK_PICK_SIZE,
  SCULPTURE_PICK_SIZE,
  artworkHitDistance3D,
  distanceSq3D,
  firstArtworkHit,
  isWithinArtworkReach,
  resolveHitObject,
  resolveIntersection,
} from "./artwork-interact.ts";

function fakeObj(userData, parent = null) {
  return { userData: userData || {}, parent };
}

describe("artwork-interact", () => {
  it("exposes a look distance beyond the old Unity 8m and prior 14m reach", () => {
    assert.ok(ARTWORK_LOOK_DISTANCE > 14);
  });

  it("exposes a floor sculpture pick volume for look-at", () => {
    assert.ok(SCULPTURE_PICK_SIZE.x >= 1);
    assert.ok(SCULPTURE_PICK_SIZE.y >= 1);
    assert.ok(SCULPTURE_PICK_SIZE.z >= 1);
    assert.ok(ARTWORK_PICK_SIZE.x > 0);
  });

  it("resolves artworkId from nested mesh parents", () => {
    const root = fakeObj({ artworkId: "sample-03" });
    const frame = fakeObj({}, root);
    const nested = fakeObj({}, frame);
    const hit = resolveHitObject(nested);
    assert.equal(hit.kind, "artwork");
    assert.equal(hit.artworkId, "sample-03");
  });

  it("prefers pedestal when flagged anywhere in the chain", () => {
    const root = fakeObj({ isPedestal: true });
    const child = fakeObj({ artworkId: "should-ignore" }, root);
    const hit = resolveHitObject(child);
    assert.equal(hit.kind, "pedestal");
    assert.equal(hit.artworkId, null);
  });

  it("rejects hits beyond look distance", () => {
    const obj = fakeObj({ artworkId: "sample-03" });
    const hit = resolveIntersection(
      { object: obj, distance: ARTWORK_LOOK_DISTANCE + 0.5 },
      ARTWORK_LOOK_DISTANCE,
    );
    assert.equal(hit.kind, "none");
  });

  it("accepts hits at the look distance boundary", () => {
    const obj = fakeObj({ artworkId: "sample-03" });
    const hit = resolveIntersection(
      { object: obj, distance: ARTWORK_LOOK_DISTANCE },
      ARTWORK_LOOK_DISTANCE,
    );
    assert.equal(hit.kind, "artwork");
    assert.equal(hit.artworkId, "sample-03");
  });

  it("skips pedestal entries when finding the first artwork hit", () => {
    const ped = fakeObj({ isPedestal: true });
    const art = fakeObj({ artworkId: "sample-03" });
    const resolved = firstArtworkHit([
      { object: ped, distance: 1 },
      { object: art, distance: 3 },
    ]);
    assert.equal(resolved.kind, "artwork");
    assert.equal(resolved.artworkId, "sample-03");
  });

  it("isWithinArtworkReach uses full 3D including raised Y (not XZ-only)", () => {
    // Same XZ stand-off; raised target is farther in 3D than a low hang.
    const cam = { x: 0, y: 2.1, z: 0 };
    const low = { x: 0, y: 2.2, z: 12 };
    const raised = { x: 0, y: 3.4, z: 12 };
    const xzOnly = 12;
    const raised3d = Math.sqrt(
      distanceSq3D(cam.x, cam.y, cam.z, raised.x, raised.y, raised.z),
    );
    assert.ok(raised3d > xzOnly);
    assert.equal(
      isWithinArtworkReach(cam.x, cam.y, cam.z, low.x, low.y, low.z, xzOnly + 0.05),
      true,
    );
    // XZ-only would still pass at 12m; 3D to raised hang exceeds that budget.
    assert.equal(
      isWithinArtworkReach(
        cam.x,
        cam.y,
        cam.z,
        raised.x,
        raised.y,
        raised.z,
        xzOnly + 0.05,
      ),
      false,
    );
    assert.equal(
      isWithinArtworkReach(
        cam.x,
        cam.y,
        cam.z,
        raised.x,
        raised.y,
        raised.z,
        ARTWORK_LOOK_DISTANCE,
      ),
      true,
    );
  });

  it("resolveIntersection measures camera→point in 3D when cam is passed", () => {
    const obj = fakeObj({ artworkId: "sample-03" });
    const cam = { x: 0, y: 2.1, z: 0 };
    // Ray reports a short horizontal-ish distance, but the hit point is raised.
    const hit = resolveIntersection(
      {
        object: obj,
        distance: 10,
        point: { x: 0, y: 3.5, z: 18 },
      },
      ARTWORK_LOOK_DISTANCE,
      cam,
    );
    const d3 = artworkHitDistance3D(
      { distance: 10, point: { x: 0, y: 3.5, z: 18 } },
      cam,
    );
    assert.ok(d3 > 18);
    assert.equal(hit.kind, "artwork");
    assert.ok(Math.abs(hit.distance - d3) < 1e-9);
  });

  it("rejects raised hit points beyond 3D look distance even if ray.distance is short", () => {
    const obj = fakeObj({ artworkId: "sample-03" });
    const cam = { x: 0, y: 2.1, z: 0 };
    const hit = resolveIntersection(
      {
        object: obj,
        distance: 5,
        point: { x: 0, y: 3.5, z: ARTWORK_LOOK_DISTANCE + 2 },
      },
      ARTWORK_LOOK_DISTANCE,
      cam,
    );
    assert.equal(hit.kind, "none");
  });
});
