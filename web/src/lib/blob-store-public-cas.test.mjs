import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { casIfMatchForAccess } from "./blob-store.ts";

/**
 * Prod failure mode (webgalerey public store):
 * CDN-stale body/etag + put({ ifMatch }) → BlobPreconditionFailed → admin 503.
 * Public puts must not send ifMatch; private puts must keep CAS.
 */
describe("public vs private CAS token for catalog-draft put", () => {
  it("suppresses CDN-stale ifMatch on public access", () => {
    const staleFromCdn = '"sha256-stale-catalog-draft"';
    assert.equal(casIfMatchForAccess("public", staleFromCdn), undefined);
  });

  it("preserves origin ifMatch on private access", () => {
    const originEtag = '"sha256-origin-catalog-draft"';
    assert.equal(casIfMatchForAccess("private", originEtag), originEtag);
  });

  it("maps the conflict path: public preferred access never CAS-guards", () => {
    // putWithAccessFallback tries preferred then fallback. On a public store the
    // successful attempt is access:"public" — token must be stripped there even
    // when mutateDraftCatalog still passes record.etag into writeBlobText.
    const recordEtag = '"etag-from-readBlobTextDetailed"';
    const preferred = "private";
    const candidates =
      preferred === "private" ? ["private", "public"] : ["public", "private"];
    const effective = candidates.map((access) => ({
      access,
      ifMatch: casIfMatchForAccess(access, recordEtag),
    }));
    assert.deepEqual(effective, [
      { access: "private", ifMatch: recordEtag },
      { access: "public", ifMatch: undefined },
    ]);
  });
});
