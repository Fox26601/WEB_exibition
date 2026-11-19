import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  heldBookletLocalPose,
  HELD_BOOKLET_LOWERED,
  HELD_BOOKLET_RAISED,
  isWithinPedestalReach,
  PEDESTAL_INTERACT_RADIUS,
  resolveBookletKeyAction,
  resolveExhibitionQAction,
} from "./booklet-interact.ts";

describe("isWithinPedestalReach", () => {
  it("is true at the pedestal and false beyond the radius", () => {
    assert.equal(isWithinPedestalReach(0, 0, 0, 0), true);
    assert.equal(
      isWithinPedestalReach(PEDESTAL_INTERACT_RADIUS, 0, 0, 0),
      true,
    );
    assert.equal(
      isWithinPedestalReach(PEDESTAL_INTERACT_RADIUS + 0.05, 0, 0, 0),
      false,
    );
  });
});

describe("resolveBookletKeyAction", () => {
  it("toggles when owned, picks up only when near, otherwise ignores", () => {
    assert.equal(
      resolveBookletKeyAction({ owned: true, nearPedestal: false }),
      "toggle",
    );
    assert.equal(
      resolveBookletKeyAction({ owned: true, nearPedestal: true }),
      "toggle",
    );
    assert.equal(
      resolveBookletKeyAction({ owned: false, nearPedestal: true }),
      "pickup",
    );
    assert.equal(
      resolveBookletKeyAction({ owned: false, nearPedestal: false }),
      null,
    );
  });
});

describe("resolveExhibitionQAction", () => {
  it("when owned, Q always raise/lowers the held map (even with art focused)", () => {
    assert.deepEqual(
      resolveExhibitionQAction({
        focusedArtworkId: "sample-01",
        owned: true,
        nearPedestal: false,
      }),
      { kind: "entrance", action: "toggle" },
    );
    assert.deepEqual(
      resolveExhibitionQAction({
        focusedArtworkId: null,
        owned: true,
        nearPedestal: false,
      }),
      { kind: "entrance", action: "toggle" },
    );
  });

  it("when not owned, focused art opens the compact art sheet (not the map)", () => {
    assert.deepEqual(
      resolveExhibitionQAction({
        focusedArtworkId: "sample-01",
        owned: false,
        nearPedestal: true,
      }),
      { kind: "art-booklet", artworkId: "sample-01" },
    );
  });

  it("when not owned, selectedArtworkId covers View/fullscreen with frozen look-at", () => {
    assert.deepEqual(
      resolveExhibitionQAction({
        focusedArtworkId: null,
        selectedArtworkId: "loop-study",
        owned: false,
        nearPedestal: false,
      }),
      { kind: "art-booklet", artworkId: "loop-study" },
    );
  });

  it("when not owned and no art focused, pedestal pickup or ignore", () => {
    assert.deepEqual(
      resolveExhibitionQAction({
        focusedArtworkId: null,
        owned: false,
        nearPedestal: true,
      }),
      { kind: "entrance", action: "pickup" },
    );
    assert.equal(
      resolveExhibitionQAction({
        focusedArtworkId: null,
        owned: false,
        nearPedestal: false,
      }),
      null,
    );
  });
});

describe("heldBookletLocalPose", () => {
  it("raises local Y and faces more toward the camera when open", () => {
    const raised = heldBookletLocalPose(true);
    const lowered = heldBookletLocalPose(false);
    assert.equal(raised, HELD_BOOKLET_RAISED);
    assert.equal(lowered, HELD_BOOKLET_LOWERED);
    assert.ok(
      raised.position.y > lowered.position.y,
      "raised booklet must sit higher in camera space",
    );
    assert.ok(
      raised.eulerDeg.x < lowered.eulerDeg.x,
      "raised map is more face-on (smaller pitch)",
    );
  });
});
