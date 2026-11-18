import assert from "node:assert/strict";
import test from "node:test";
import { resolveGalleryRenderer } from "./gallery-renderer.ts";

test("resolveGalleryRenderer always returns three", () => {
  assert.equal(resolveGalleryRenderer(true, ""), "three");
  assert.equal(resolveGalleryRenderer(true, "?catalog=live"), "three");
  assert.equal(resolveGalleryRenderer(true, "?renderer=three"), "three");
  assert.equal(resolveGalleryRenderer(true, "?renderer=legacy"), "three");
  assert.equal(
    resolveGalleryRenderer(true, "?catalog=draft&renderer=legacy"),
    "three",
  );
  assert.equal(resolveGalleryRenderer(false, ""), "three");
});
