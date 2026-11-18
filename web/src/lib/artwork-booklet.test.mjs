import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceBookletPageIndex,
  emptyLocalized,
  normalizeArtwork,
  normalizeArtworkBooklet,
} from "./catalog-types.ts";

const sample = {
  id: "a1",
  type: "image",
  sort: 0,
  published: true,
  title: {
    en: "Morning",
    ru: "Утро",
    uk: "Ранок",
    he: "בוקר",
  },
  text: {
    en: "Wall note",
    ru: "Заметка",
    uk: "Нотатка",
    he: "הערה",
  },
  urlWall: "",
  urlFull: "",
  urlVideo: "",
  urlPoster: "",
};

describe("normalizeArtworkBooklet", () => {
  it("seeds one main page from title+text when booklet missing", () => {
    const pages = normalizeArtworkBooklet(sample);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].key, "main");
    assert.equal(pages[0].title.en, "Morning");
    assert.equal(pages[0].body.en, "Wall note");
  });

  it("seeds from empty array the same way", () => {
    const pages = normalizeArtworkBooklet({ ...sample, booklet: [] });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].body.ru, "Заметка");
  });

  it("preserves multi-page booklets", () => {
    const pages = normalizeArtworkBooklet({
      ...sample,
      booklet: [
        {
          key: "main",
          title: emptyLocalized("A"),
          body: emptyLocalized("a"),
        },
        {
          key: "more",
          title: emptyLocalized("B"),
          body: emptyLocalized("b"),
        },
      ],
    });
    assert.equal(pages.length, 2);
    assert.equal(pages[1].key, "more");
    assert.equal(pages[1].title.en, "B");
  });
});

describe("normalizeArtwork sync", () => {
  it("writes page-1 title/body back to title/text on save sync", () => {
    const art = normalizeArtwork(
      {
        ...sample,
        booklet: [
          {
            key: "main",
            title: emptyLocalized("Synced title"),
            body: emptyLocalized("Synced body"),
          },
        ],
      },
      { syncTitleTextFromBooklet: true },
    );
    assert.equal(art.title.en, "Synced title");
    assert.equal(art.text.en, "Synced body");
    assert.equal(art.booklet?.length, 1);
  });
});

describe("advanceBookletPageIndex", () => {
  it("clamps left/right page turns", () => {
    assert.equal(advanceBookletPageIndex(0, -1, 3), 0);
    assert.equal(advanceBookletPageIndex(0, 1, 3), 1);
    assert.equal(advanceBookletPageIndex(2, 1, 3), 2);
    assert.equal(advanceBookletPageIndex(1, -1, 3), 0);
    assert.equal(advanceBookletPageIndex(0, 1, 0), 0);
  });
});
