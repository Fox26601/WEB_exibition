import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractGeminiText,
  parseTranslationJson,
  summarizeUpstreamFailure,
  translateFailMessage,
} from "./gemini-translate.ts";

describe("extractGeminiText", () => {
  it("joins answer parts and skips thought parts", () => {
    const text = extractGeminiText({
      candidates: [
        {
          content: {
            parts: [
              { thought: true, text: "reasoning…" },
              { text: '{"en":"Hello"}' },
            ],
          },
        },
      ],
    });
    assert.equal(text, '{"en":"Hello"}');
  });

  it("returns null when no answer text exists", () => {
    assert.equal(
      extractGeminiText({
        candidates: [{ content: { parts: [{ thought: true, text: "x" }] } }],
      }),
      null,
    );
  });
});

describe("parseTranslationJson", () => {
  it("parses locale map and ignores blank values", () => {
    const parsed = parseTranslationJson(
      '{"en":"Hi","ru":"Привет","uk":"  ","he":"שלום"}',
      ["en", "ru", "uk", "he"],
    );
    assert.deepEqual(parsed, {
      en: "Hi",
      ru: "Привет",
      he: "שלום",
    });
  });

  it("strips markdown fences", () => {
    const parsed = parseTranslationJson(
      '```json\n{"ru":"Да"}\n```',
      ["ru"],
    );
    assert.deepEqual(parsed, { ru: "Да" });
  });
});

describe("translateFailMessage", () => {
  it("mentions missing key clearly", () => {
    assert.match(
      translateFailMessage("missing_api_key"),
      /GEMINI_API_KEY/,
    );
  });

  it("includes upstream detail when provided", () => {
    assert.equal(
      translateFailMessage(
        "upstream_error",
        "model gemini-2.0-flash unavailable (HTTP 404)",
      ),
      "Auto-translate failed: model gemini-2.0-flash unavailable (HTTP 404)",
    );
  });
});

describe("summarizeUpstreamFailure", () => {
  it("flags retired / missing models", async () => {
    const response = new Response(
      JSON.stringify({
        error: {
          message:
            "This model models/gemini-2.0-flash is no longer available. Please update your code.",
        },
      }),
      { status: 404 },
    );
    const detail = await summarizeUpstreamFailure(
      response,
      "gemini-2.0-flash",
    );
    assert.match(detail, /unavailable/);
    assert.match(detail, /404/);
  });

  it("flags rejected API keys", async () => {
    const response = new Response(
      JSON.stringify({ error: { message: "API key not valid" } }),
      { status: 403 },
    );
    const detail = await summarizeUpstreamFailure(
      response,
      "gemini-3.6-flash",
    );
    assert.match(detail, /API key/);
    assert.match(detail, /403/);
  });
});
