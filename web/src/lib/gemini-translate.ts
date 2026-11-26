import type { Locale } from "./catalog-types";
import { LOCALE_LABELS } from "./admin-translate";

/**
 * Default: gemini-3.1-flash-lite — cheap Flash-Lite sized for translation.
 * gemini-2.0-flash shut down 2026-06-01; gemini-3.6-flash hit high-demand 503s.
 * Override with GEMINI_TRANSLATE_MODEL when needed.
 */
const GEMINI_MODEL =
  process.env.GEMINI_TRANSLATE_MODEL?.trim() || "gemini-3.1-flash-lite";

export type GeminiTranslateFailReason =
  | "missing_api_key"
  | "upstream_error"
  | "parse_error";

export type GeminiTranslateResult =
  | { ok: true; translations: Partial<Record<Locale, string>> }
  | {
      ok: false;
      reason: GeminiTranslateFailReason;
      /** Safe admin-facing detail (no secrets). */
      detail?: string;
    };

export function translateFailMessage(
  reason: GeminiTranslateFailReason,
  detail?: string,
): string {
  switch (reason) {
    case "missing_api_key":
      return "Auto-translate unavailable: GEMINI_API_KEY is not configured on the server.";
    case "parse_error":
      return "Auto-translate failed: unexpected response from Gemini.";
    case "upstream_error":
      return detail
        ? `Auto-translate failed: ${detail}`
        : "Auto-translate failed: Gemini API error.";
  }
}

/** Prefer GEMINI_API_KEY; accept GOOGLE_GENERATIVE_AI_API_KEY as alias. */
export function getGeminiApiKey(): string | null {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    "";
  return key || null;
}

export function getGeminiTranslateModel(): string {
  return GEMINI_MODEL;
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
          // Gemini 3.x ignores / will reject temperature; do not send it.
          responseMimeType: "application/json",
          thinkingConfig: { thinkingLevel: "MINIMAL" },
        },
      }),
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      options.signal?.aborted;
    if (aborted) {
      return { ok: false, reason: "upstream_error", detail: "request aborted" };
    }
    return {
      ok: false,
      reason: "upstream_error",
      detail: "network error reaching Gemini",
    };
  }

  if (!response.ok) {
    const detail = await summarizeUpstreamFailure(response, GEMINI_MODEL);
    return { ok: false, reason: "upstream_error", detail };
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

/** Build a short, secret-free failure detail from an HTTP error body. */
export async function summarizeUpstreamFailure(
  response: Response,
  model: string,
): Promise<string> {
  const status = response.status;
  let apiMessage = "";
  try {
    const body = (await response.json()) as {
      error?: { message?: string; status?: string };
    };
    apiMessage = String(body?.error?.message ?? "").trim();
  } catch {
    // ignore non-JSON error bodies
  }

  const lower = apiMessage.toLowerCase();
  if (
    status === 404 ||
    lower.includes("no longer available") ||
    lower.includes("not found")
  ) {
    return `model ${model} unavailable (HTTP ${status})`;
  }
  if (status === 400) {
    return apiMessage
      ? `bad request (HTTP 400): ${truncate(apiMessage, 160)}`
      : `bad request (HTTP 400) for model ${model}`;
  }
  if (status === 401 || status === 403) {
    return `Gemini rejected the API key (HTTP ${status})`;
  }
  if (status === 429) {
    return `Gemini rate limited (HTTP 429)`;
  }
  if (
    status === 503 ||
    lower.includes("high demand") ||
    lower.includes("overloaded")
  ) {
    return `Gemini model ${model} overloaded / high demand (HTTP ${status}) — retry shortly or set GEMINI_TRANSLATE_MODEL`;
  }
  if (apiMessage) {
    return `HTTP ${status}: ${truncate(apiMessage, 160)}`;
  }
  return `HTTP ${status} from Gemini (${model})`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function extractGeminiText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const candidates = (payload as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || !candidates[0]) return null;
  const content = (candidates[0] as { content?: unknown }).content;
  if (!content || typeof content !== "object") return null;
  const parts = (content as { parts?: unknown }).parts;
  if (!Array.isArray(parts)) return null;
  const chunks: string[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object") continue;
    // Skip thinking/thought parts — only keep the final answer text.
    if ((part as { thought?: unknown }).thought === true) continue;
    if (typeof (part as { text?: unknown }).text === "string") {
      chunks.push((part as { text: string }).text);
    }
  }
  const joined = chunks.join("").trim();
  return joined || null;
}

export function parseTranslationJson(
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
