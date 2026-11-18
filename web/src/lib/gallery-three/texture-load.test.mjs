import assert from "node:assert/strict";
import test from "node:test";
import { resolveGalleryMediaUrl } from "./texture-load.ts";

test("resolveGalleryMediaUrl keeps absolute https", () => {
  const u = "https://example.com/a.jpg";
  assert.equal(resolveGalleryMediaUrl(u), u);
});

test("resolveGalleryMediaUrl passes relative paths without window", () => {
  assert.equal(resolveGalleryMediaUrl("/samples/sample-01.jpg"), "/samples/sample-01.jpg");
});