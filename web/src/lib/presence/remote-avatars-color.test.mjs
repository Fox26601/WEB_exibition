import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { colorForActor } from "./remote-avatars.ts";

describe("wisp colorForActor", () => {
  it("returns stable distinct palette colors by actorNr", () => {
    const a = colorForActor(1);
    const b = colorForActor(2);
    const again = colorForActor(1);
    assert.equal(a, again);
    assert.notEqual(a, b);
  });

  it("wraps the palette for large actor numbers", () => {
    assert.equal(colorForActor(0), colorForActor(8));
    assert.equal(colorForActor(3), colorForActor(11));
  });
});
