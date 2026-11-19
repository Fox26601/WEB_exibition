import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELD_BOOKLET_LOWERED,
  HELD_BOOKLET_RAISED,
  lerpHeldBookletPose,
  paintHeldMapPage,
} from "./booklet-interact.ts";

describe("lerpHeldBookletPose", () => {
  it("returns lowered at 0 and raised at 1", () => {
    assert.deepEqual(lerpHeldBookletPose(0), HELD_BOOKLET_LOWERED);
    assert.deepEqual(lerpHeldBookletPose(1), HELD_BOOKLET_RAISED);
  });

  it("midpoint sits between lowered and raised Y", () => {
    const mid = lerpHeldBookletPose(0.5);
    assert.ok(mid.position.y > HELD_BOOKLET_LOWERED.position.y);
    assert.ok(mid.position.y < HELD_BOOKLET_RAISED.position.y);
  });
});

describe("paintHeldMapPage", () => {
  it("paints parchment without throwing", () => {
    const ops = [];
    const canvas = { width: 512, height: 384 };
    canvas.getContext = () => ({
      canvas,
      fillStyle: "",
      strokeStyle: "",
      lineWidth: 1,
      font: "",
      textAlign: "left",
      textBaseline: "top",
      fillRect(...a) {
        ops.push("fillRect");
      },
      strokeRect(...a) {
        ops.push("strokeRect");
      },
      fillText(...a) {
        ops.push("fillText");
      },
      measureText(t) {
        return { width: String(t).length * 8 };
      },
    });
    paintHeldMapPage(canvas, {
      title: "Exhibition map",
      body: "Walk the foyer then enter the hall.",
      pageLabel: "1 / 2",
    });
    assert.ok(ops.includes("fillRect"));
    assert.ok(ops.includes("fillText"));
  });
});
