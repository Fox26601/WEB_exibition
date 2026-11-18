import assert from "node:assert/strict";
import test from "node:test";
import { resolveGalleryRenderer } from "./gallery-renderer.ts";

test("resolveGalleryRenderer forces three from query when wasm present", () => {
  assert.equal(
    resolveGalleryRenderer(true, "?renderer=three"),
    "three",
  );
  assert.equal(
    resolveGalleryRenderer(true, "?catalog=live&renderer=three"),
    "three",
  );
});

test("resolveGalleryRenderer prefers unity when wasm present and no override", () => {
  assert.equal(resolveGalleryRenderer(true, ""), "unity");
  assert.equal(resolveGalleryRenderer(true, "?catalog=live"), "unity");
});

test("resolveGalleryRenderer falls back to three without wasm", () => {
  assert.equal(resolveGalleryRenderer(false, ""), "three");
});