import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sameCatalogRevision } from "./catalog-types.ts";

describe("sameCatalogRevision", () => {
  it("returns false when previous is missing", () => {
    assert.equal(sameCatalogRevision(null, { version: 1, updatedAt: "a" }), false);
    assert.equal(
      sameCatalogRevision(undefined, { version: 1, updatedAt: "a" }),
      false,
    );
  });

  it("returns true only when version and updatedAt both match", () => {
    const a = { version: 3, updatedAt: "2026-11-22T12:00:00.000Z" };
    assert.equal(sameCatalogRevision(a, { ...a }), true);
    assert.equal(
      sameCatalogRevision(a, { version: 4, updatedAt: a.updatedAt }),
      false,
    );
    assert.equal(
      sameCatalogRevision(a, {
        version: 3,
        updatedAt: "2026-11-22T12:00:01.000Z",
      }),
      false,
    );
  });
});
