import assert from "node:assert/strict";
import test from "node:test";
import { resolveGalleryRenderer } from "./gallery-renderer.ts";

test("resolveGalleryRenderer defaults to three when wasm present", () => {
  assert.equal(resolveGalleryRenderer(true, ""), "three");
  assert.equal(resolveGalleryRenderer(true, "?catalog=live"), "three");
});

test("resolveGalleryRenderer forces three from explicit query", () => {
  assert.equal(
    resolveGalleryRenderer(true, "?renderer=three"),
    "three",
  );
});

test("resolveGalleryRenderer loads unity only when explicitly requested", () => {
  assert.equal(resolveGalleryRenderer(true, "?renderer=unity"), "unity");
  assert.equal(
    resolveGalleryRenderer(true, "?catalog=draft&renderer=unity"),
    "unity",
  );
});

test("resolveGalleryRenderer defaults to three without wasm", () => {
  assert.equal(resolveGalleryRenderer(false, ""), "three");
});