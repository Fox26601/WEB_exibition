import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  advanceBookletPageIndex,
  emptyLocalized,
  nextBookletPageKey,
  normalizeArtwork,
  normalizeArtworkBooklet,
  normalizeEntrance,
  renumberBookletPages,
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
  it("seeds one numeric page from title+text when booklet missing", () => {
    const pages = normalizeArtworkBooklet(sample);
    assert.equal(pages.length, 1);
    assert.equal(pages[0].key, "1");
    assert.equal(pages[0].title.en, "Morning");
    assert.equal(pages[0].body.en, "Wall note");
  });

  it("seeds from empty array the same way", () => {
    const pages = normalizeArtworkBooklet({ ...sample, booklet: [] });
    assert.equal(pages.length, 1);
    assert.equal(pages[0].key, "1");
    assert.equal(pages[0].body.ru, "Заметка");
  });

  it("remaps legacy free-text keys to numbers and preserves order", () => {
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
    assert.equal(pages[0].key, "1");
    assert.equal(pages[1].key, "2");
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
    assert.equal(art.booklet?.[0].key, "1");
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

describe("nextBookletPageKey", () => {
  it("starts at 1 when no numeric keys exist", () => {
    assert.equal(nextBookletPageKey([]), "1");
    assert.equal(nextBookletPageKey([{ key: "main" }, { key: "intro" }]), "1");
  });

  it("increments past the highest numeric key", () => {
    assert.equal(
      nextBookletPageKey([{ key: "main" }, { key: "2" }, { key: "9" }]),
      "10",
    );
    assert.equal(nextBookletPageKey([{ key: "1" }, { key: "3" }]), "4");
  });
});

describe("renumberBookletPages", () => {
  it("maps intro/hall-1 to 1/2", () => {
    const pages = renumberBookletPages([
      { key: "intro", title: "a" },
      { key: "hall-1", title: "b" },
    ]);
    assert.deepEqual(
      pages.map((p) => p.key),
      ["1", "2"],
    );
  });

  it("keeps unique numeric keys and fills gaps for legacy ones", () => {
    const pages = renumberBookletPages([
      { key: "main" },
      { key: "2" },
      { key: "intro" },
    ]);
    assert.deepEqual(
      pages.map((p) => p.key),
      ["1", "2", "3"],
    );
  });

  it("is stable when keys are already numeric", () => {
    const pages = renumberBookletPages([{ key: "1" }, { key: "2" }]);
    assert.deepEqual(
      pages.map((p) => p.key),
      ["1", "2"],
    );
  });
});

describe("normalizeEntrance", () => {
  it("remaps legacy intro key used in prod catalogs", () => {
    const entrance = normalizeEntrance({
      posterUrl: "",
      booklet: [
        {
          key: "intro",
          title: emptyLocalized("Exhibition"),
          body: emptyLocalized(""),
        },
      ],
    });
    assert.equal(entrance.booklet.length, 1);
    assert.equal(entrance.booklet[0].key, "1");
    assert.equal(entrance.booklet[0].title.en, "Exhibition");
  });

  it("seeds empty entrance with key 1", () => {
    const entrance = normalizeEntrance({ posterUrl: "", booklet: [] });
    assert.equal(entrance.booklet[0].key, "1");
  });
});
