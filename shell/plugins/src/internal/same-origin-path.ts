const MAX_SAME_ORIGIN_PATH_LENGTH = 2_048;
const SAME_ORIGIN_SENTINEL = "https://brains.invalid";
const unsafePathCharacterPattern = /[\s\\\p{Cc}\p{Cf}]/u;

/** Normalize a bounded same-origin browser path, or reject it without throwing. */
export function normalizeSameOriginPath(value: unknown): string | undefined {
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > MAX_SAME_ORIGIN_PATH_LENGTH ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafePathCharacterPattern.test(value)
  ) {
    return undefined;
  }

  try {
    const url = new URL(value, SAME_ORIGIN_SENTINEL);
    if (url.origin !== SAME_ORIGIN_SENTINEL) return undefined;

    const normalized = `${url.pathname}${url.search}${url.hash}`;
    return normalized.length > 0 &&
      normalized.length <= MAX_SAME_ORIGIN_PATH_LENGTH &&
      normalized.startsWith("/") &&
      !normalized.startsWith("//") &&
      !unsafePathCharacterPattern.test(normalized)
      ? normalized
      : undefined;
  } catch {
    // new URL raises on input it cannot parse. A path we cannot parse is
    // not a path we should treat as same-origin.
    return undefined;
  }
}

/** Set encoded query values on a validated path and revalidate the result. */
export function setSameOriginSearchParams(
  value: unknown,
  entries: ReadonlyArray<readonly [string, string]>,
  options: { replace?: boolean } = {},
): string | undefined {
  const normalized = normalizeSameOriginPath(value);
  if (!normalized) return undefined;

  const url = new URL(normalized, SAME_ORIGIN_SENTINEL);
  if (options.replace) {
    url.search = "";
    url.hash = "";
  }
  for (const [key, entryValue] of entries) {
    url.searchParams.set(key, entryValue);
  }
  return normalizeSameOriginPath(`${url.pathname}${url.search}${url.hash}`);
}
