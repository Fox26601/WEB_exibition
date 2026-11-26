import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  blobGetErrorIsSoftMiss,
  isBlobStoreAccessMismatch,
} from "./blob-store.ts";

describe("blob store access mismatch (public store + private SDK calls)", () => {
  it("detects private put rejected by a public store", () => {
    const err = new Error(
      "Vercel Blob: Cannot use private access on a public store. The store must be configured with private access.",
    );
    assert.equal(isBlobStoreAccessMismatch(err), true);
    assert.equal(blobGetErrorIsSoftMiss(err), true);
  });

  it("detects private get 400 against *.private.blob on a public store", () => {
    const err = new Error("Vercel Blob: Failed to fetch blob: 400 Bad Request");
    assert.equal(isBlobStoreAccessMismatch(err), true);
    assert.equal(blobGetErrorIsSoftMiss(err), true);
  });

  it("soft-misses forbidden / not-found get errors so fallbacks run", () => {
    assert.equal(
      blobGetErrorIsSoftMiss(
        new Error(
          "Access denied, please provide a valid token for this resource.",
        ),
      ),
      true,
    );
    assert.equal(
      blobGetErrorIsSoftMiss(
        new Error("The requested blob does not exist"),
      ),
      true,
    );
  });

  it("does not treat unrelated write conflicts as access mismatch", () => {
    const err = new Error("Blob write conflict for catalog-draft.json");
    assert.equal(isBlobStoreAccessMismatch(err), false);
  });
});
