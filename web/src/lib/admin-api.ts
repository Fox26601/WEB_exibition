/** Normalize admin API error bodies into a short user-visible string. */
export function formatAdminApiError(
  data: unknown,
  fallback = "Request failed",
): string {
  if (data == null) return fallback;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data !== "object") return fallback;

  const obj = data as Record<string, unknown>;
  const err = obj.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err != null) {
    try {
      return JSON.stringify(err);
    } catch {
      /* fall through */
    }
  }
  if (typeof obj.message === "string" && obj.message.trim()) {
    return obj.message.trim();
  }
  return fallback;
}

/**
 * Parse a fetch Response + JSON body into either data or a thrown Error
 * with status context (e.g. "403: Forbidden").
 */
export async function readAdminJson<T = unknown>(
  res: Response,
  fallback = "Request failed",
): Promise<T> {
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const detail = formatAdminApiError(data, fallback);
    throw new Error(`${res.status}: ${detail}`);
  }
  return data as T;
}
