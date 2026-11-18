import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARTWORK_LOOK_DISTANCE,
  firstArtworkHit,
  resolveHitObject,
  resolveIntersection,
} from "./artwork-interact.ts";

function fakeObj(userData, parent = null) {
  return { userData: userData || {}, parent };
}

describe("artwork-interact", () => {
  it("exposes a look distance beyond the old Unity 8m reach", () => {
    assert.ok(ARTWORK_LOOK_DISTANCE > 8);
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
});
