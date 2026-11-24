import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  emptySiblingLocales,
  isEmptyLocalizedValue,
  mergeOnlyEmptyTranslations,
  planAutoTranslate,
} from "./admin-translate.ts";

describe("isEmptyLocalizedValue", () => {
  it("treats blank and whitespace as empty", () => {
    assert.equal(isEmptyLocalizedValue(""), true);
    assert.equal(isEmptyLocalizedValue("   "), true);
    assert.equal(isEmptyLocalizedValue(null), true);
    assert.equal(isEmptyLocalizedValue(undefined), true);
    assert.equal(isEmptyLocalizedValue("Hello"), false);
  });
});

describe("emptySiblingLocales", () => {
  it("returns only empty locales other than the source", () => {
    const fields = {
      en: "Sunset",
      ru: "",
      uk: "  ",
      he: "שקיעה",
    };
    assert.deepEqual(emptySiblingLocales(fields, "en"), ["ru", "uk"]);
  });

  it("returns empty array when all siblings are filled", () => {
    const fields = {
      en: "A",
      ru: "B",
      uk: "C",
      he: "D",
    };
    assert.deepEqual(emptySiblingLocales(fields, "ru"), []);
  });
});

describe("mergeOnlyEmptyTranslations", () => {
  it("fills only empty fields and never overwrites non-empty text", () => {
    const current = {
      en: "Sunset",
      ru: "существующий",
      uk: "",
      he: "  ",
    };
    const merged = mergeOnlyEmptyTranslations(current, {
      en: "SHOULD_NOT_OVERWRITE",
      ru: "ALSO_NOT",
      uk: "Захід",
      he: "שקיעה",
    });
    assert.deepEqual(merged, {
      en: "Sunset",
      ru: "существующий",
      uk: "Захід",
      he: "שקיעה",
    });
  });

  it("ignores blank translation values", () => {
    const current = { en: "Hi", ru: "", uk: "", he: "" };
    const merged = mergeOnlyEmptyTranslations(current, {
      ru: "  ",
      uk: "Привіт",
    });
    assert.deepEqual(merged, {
      en: "Hi",
      ru: "",
      uk: "Привіт",
      he: "",
    });
  });
});

describe("planAutoTranslate", () => {
  it("skips when source text is blank", () => {
    assert.equal(
      planAutoTranslate(
        { en: "", ru: "", uk: "", he: "" },
        "en",
        "   ",
      ),
      null,
    );
  });

  it("skips when no empty sibling targets remain", () => {
    assert.equal(
      planAutoTranslate(
        { en: "A", ru: "B", uk: "C", he: "D" },
        "en",
        "A",
      ),
      null,
    );
  });

  it("plans targets for empty siblings only", () => {
    const plan = planAutoTranslate(
      { en: "", ru: "уже есть", uk: "", he: "" },
      "en",
      "Quiet room",
    );
    assert.ok(plan);
    assert.equal(plan.sourceLocale, "en");
    assert.equal(plan.text, "Quiet room");
    assert.deepEqual(plan.targetLocales, ["uk", "he"]);
  });
});
