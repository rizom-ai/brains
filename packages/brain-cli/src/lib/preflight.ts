interface PreflightResult {
  ok: boolean;
  message?: string;
}

const MIN_BUN_VERSION = "1.3.3";

/**
 * Check that AI_API_KEY is set and non-empty.
 */
export function checkApiKey(
  env: Record<string, string | undefined>,
): PreflightResult {
  const key = env["AI_API_KEY"]?.trim();
  if (!key) {
    return {
      ok: false,
      message:
        "AI_API_KEY is not set. Add it to your .env file:\n\n  AI_API_KEY=your-api-key-here\n",
    };
  }
  return { ok: true };
}

/**
 * Check that Bun version meets minimum requirement.
 */
export function checkBunVersion(version: string): PreflightResult {
  const [major, minor, patch] = version.split(".").map(Number);
  const [minMajor, minMinor, minPatch] = MIN_BUN_VERSION.split(".").map(Number);

  const current = (major ?? 0) * 10000 + (minor ?? 0) * 100 + (patch ?? 0);
  const minimum =
    (minMajor ?? 0) * 10000 + (minMinor ?? 0) * 100 + (minPatch ?? 0);

  if (current < minimum) {
    return {
      ok: false,
      message: `Bun ${MIN_BUN_VERSION} or later is required (found ${version}). Update: curl -fsSL https://bun.sh/install | bash`,
    };
  }
  return { ok: true };
}
