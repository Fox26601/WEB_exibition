import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  HELD_BOOKLET_LOWERED,
  HELD_BOOKLET_RAISED,
  HELD_MAP_PLANE,
  HELD_MAP_SCALE_RAISED,
  heldMapFovHeightFraction,
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

describe("heldMapFovHeightFraction", () => {
  it("keeps raised Minecraft map within ~25–35% of view height", () => {
    const frac = heldMapFovHeightFraction(HELD_BOOKLET_RAISED.position.z, {
      height: HELD_MAP_PLANE.height,
      scale: HELD_MAP_SCALE_RAISED,
    });
    assert.ok(frac >= 0.25, `too small: ${frac}`);
    assert.ok(frac <= 0.35, `too large: ${frac}`);
  });

  it("places raised map bottom-right of view (not centered)", () => {
    assert.ok(HELD_BOOKLET_RAISED.position.x >= 0.15);
    assert.ok(HELD_BOOKLET_RAISED.position.y <= -0.1);
  });
});

describe("paintHeldMapPage", () => {
  it("paints parchment without throwing", () => {
    const ops = [];
    const fonts = [];
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
      set font(v) {
        fonts.push(v);
        this._font = v;
      },
      get font() {
        return this._font || "";
      },
    });
    paintHeldMapPage(canvas, {
      title: "Exhibition map",
      body: "Walk the foyer then enter the hall.",
      pageLabel: "1 / 2",
    });
    assert.ok(ops.includes("fillRect"));
    assert.ok(ops.includes("fillText"));
    const titleFont = fonts.find((f) => String(f).includes("bold"));
    assert.ok(titleFont, "expected bold title font");
    const px = Number(String(titleFont).match(/(\d+)px/)?.[1] || 0);
    // Compact title: ~4.2% of canvas width (512 → ~22px), not the old ~6.5%.
    assert.ok(px > 0 && px <= Math.round(512 * 0.05), `title too large: ${px}`);
  });
});
