import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { wallVideoHasFrame } from "./wall-video.ts";

describe("wallVideoHasFrame", () => {
  it("requires HAVE_CURRENT_DATA or better", () => {
    assert.equal(wallVideoHasFrame({ readyState: 0 }), false);
    assert.equal(wallVideoHasFrame({ readyState: 1 }), false);
    assert.equal(wallVideoHasFrame({ readyState: 2 }), true);
    assert.equal(wallVideoHasFrame({ readyState: 4 }), true);
  });
});
