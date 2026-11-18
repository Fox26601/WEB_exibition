import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isWithinPedestalReach,
  PEDESTAL_INTERACT_RADIUS,
  resolveBookletKeyAction,
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
