import type { Locale } from "./catalog-types";
import { LOCALE_LABELS } from "./admin-translate";

const GEMINI_MODEL =
  process.env.GEMINI_TRANSLATE_MODEL?.trim() || "gemini-2.0-flash";

export type GeminiTranslateResult =
  | { ok: true; translations: Partial<Record<Locale, string>> }
  | { ok: false; reason: "missing_api_key" | "upstream_error" | "parse_error" };

/** Prefer GEMINI_API_KEY; accept GOOGLE_GENERATIVE_AI_API_KEY as alias. */
export function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    "";
  return key || null;
}

/**
 * Translate `text` from sourceLocale into each target locale via Gemini.
 * Soft-fails (ok:false) when the key is missing or the upstream call fails.
 */
export async function translateWithGemini(options: {
  text: string;
  sourceLocale: Locale;
  targetLocales: Locale[];
  signal?: AbortSignal;
}): Promise<GeminiTranslateResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return { ok: false, reason: "missing_api_key" };

  const targets = options.targetLocales.filter(
    (locale) => locale !== options.sourceLocale,
  );
  if (targets.length === 0) {
    return { ok: true, translations: {} };
  }

  const targetList = targets
    .map((locale) => `${locale} (${LOCALE_LABELS[locale]})`)
    .join(", ");

  const prompt = [
    "You translate exhibition artwork titles and booklet body text.",
    "Return ONLY a JSON object mapping locale codes to translated strings.",
    `Source language: ${options.sourceLocale} (${LOCALE_LABELS[options.sourceLocale]}).`,
    `Target locales: ${targetList}.`,
    "Keep proper names when appropriate. Preserve line breaks for multi-line body text.",
    "Do not wrap the JSON in markdown fences.",
    "",
    "Text:",
    options.text,
  ].join("\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    GEMINI_MODEL,
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: options.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: "application/json",
        },
      }),
    });
  } catch {
    return { ok: false, reason: "upstream_error" };
  }

  if (!response.ok) {
    return { ok: false, reason: "upstream_error" };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, reason: "parse_error" };
  }

  const rawText = extractGeminiText(payload);
  if (!rawText) return { ok: false, reason: "parse_error" };

  const parsed = parseTranslationJson(rawText, targets);
  if (!parsed) return { ok: false, reason: "parse_error" };
  return { ok: true, translations: parsed };
}

function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0]) return null;
  const content = (candidates[0] as { content?: unknown }).content;
  if (!content || typeof content !== "object") return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const chunks: string[] = [];
  for (const part of parts) {
    if (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string") {
      chunks.push((part as { text: string }).text);
    }
  }
  const joined = chunks.join("").trim();
  return joined || null;
}

function parseTranslationJson(
  raw: string,
  targets: Locale[],
): Partial<Record<Locale, string>> | null {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const out: Partial<Record<Locale, string>> = {};
  for (const locale of targets) {
    const value = (data as Record<string, unknown>)[locale];
    if (typeof value === "string" && value.trim()) {
      out[locale] = value;
    }
  }
  return out;
}
