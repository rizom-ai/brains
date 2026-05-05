/**
 * String utility functions
 */

const ENV_VAR_PATTERN = /\$\{[^}]+\}/g;

/**
 * Interpolate ${ENV_VAR} references in a string with process.env values.
 * Returns the original string if no references are found.
 * Returns undefined if any referenced env var is not set.
 */
export function interpolateEnvVar(value: string): string | undefined {
  const matches = value.match(ENV_VAR_PATTERN);
  if (!matches) return value;

  let result = value;
  for (const match of matches) {
    const varName = match.slice(2, -1); // strip ${ and }
    const envValue = process.env[varName];
    if (envValue === undefined) return undefined;
    result = result.replace(match, envValue);
  }
  return result;
}

/**
 * Recursively interpolate ${ENV_VAR} references in a parsed object.
 * - String values: "${VAR}" → process.env.VAR
 * - Object keys: "${VAR}" → process.env.VAR
 * - Removes entries where env vars are not set
 */
export function interpolateEnv(data: unknown): unknown {
  if (typeof data === "string") {
    return interpolateEnvVar(data);
  }

  if (Array.isArray(data)) {
    return data
      .map((item) => interpolateEnv(item))
      .filter((item) => item !== undefined);
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const interpolatedKey = interpolateEnvVar(key);
      if (interpolatedKey === undefined) continue;

      const interpolatedValue = interpolateEnv(value);
      if (interpolatedValue === undefined) continue;

      result[interpolatedKey] = interpolatedValue;
    }
    return result;
  }

  return data;
}

/**
 * Convert a string to a URL-safe slug
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/[\s_-]+/g, "-") // Replace spaces, underscores, hyphens with single hyphen
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Derive a URL-safe slug from a URL by extracting the hostname
 * and replacing dots with hyphens.
 * e.g. "https://yeehaa.io" → "yeehaa-io"
 *      "https://ranger.rizom.ai" → "ranger-rizom-ai"
 */
export function slugifyUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/\./g, "-");
  } catch {
    const hostname = url.split("/")[0] ?? url;
    return hostname.replace(/\./g, "-");
  }
}

/**
 * Generate a unique ID from text by slugifying it, with optional suffix
 */
export function generateIdFromText(text: string, suffix?: string): string {
  const slug = slugify(text);
  if (!slug) {
    // Fallback for edge cases where slug is empty
    const timestamp = Date.now().toString(36);
    return suffix ? `id-${timestamp}-${suffix}` : `id-${timestamp}`;
  }
  return suffix ? `${slug}-${suffix}` : slug;
}

/**
 * Words that don't change form in plural
 */
const INVARIANT_WORDS = new Set(["series", "species", "sheep", "deer", "fish"]);

/**
 * Simple English pluralization for common cases
 * Handles: invariant words, consonant+y → -ies, -s/-x/-ch → -es, default → -s
 */
export function pluralize(word: string): string {
  // Check for invariant words (case-insensitive)
  if (INVARIANT_WORDS.has(word.toLowerCase())) {
    return word;
  }
  // Handle common cases
  // Only consonant + y becomes ies (baby → babies), vowel + y stays ys (essay → essays)
  if (word.endsWith("y") && word.length > 1) {
    const beforeY = word[word.length - 2];
    const isVowelBeforeY = "aeiou".includes(beforeY?.toLowerCase() ?? "");
    if (!isVowelBeforeY) {
      return word.slice(0, -1) + "ies";
    }
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch")) {
    return word + "es";
  }
  return word + "s";
}

/**
 * Convert a camelCase, snake_case, or kebab-case identifier to a
 * Title Case human-readable label. Collapses runs of whitespace.
 * Every word is title-cased (not just the first).
 */
export function formatLabel(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert a kebab-case entity type to a human-friendly display name.
 * Splits on hyphens, title-cases each word, pluralizes the last word.
 */
export function toDisplayName(entityType: string): string {
  const words = entityType.split("-");
  const titleCased = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  const lastWord = titleCased.pop();
  if (lastWord) {
    titleCased.push(pluralize(lastWord));
  }
  return titleCased.join(" ");
}

const LINK_LABEL_CANONICAL: Record<string, string> = {
  github: "GitHub",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  email: "Email",
  website: "Website",
};

/**
 * Format a link/platform label for display. Known platforms
 * (github, linkedin, etc.) resolve to their canonical spelling;
 * unknown labels fall back to title case.
 */
export function displayLinkLabel(label: string): string {
  const key = label.toLowerCase();
  const canonical = LINK_LABEL_CANONICAL[key];
  if (canonical !== undefined) return canonical;
  return label.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Calculate estimated reading time in minutes
 * Based on average reading speed of 200 words per minute
 */
export function calculateReadingTime(content: string): number {
  const wordsPerMinute = 200;
  const wordCount = content
    .split(/\s+/)
    .filter((word) => word.length > 0).length;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/**
 * Extract the first sentence from a block of text, capped at 200 chars
 * with ellipsis. Returns undefined for empty input.
 */
export function firstSentence(text: string): string | undefined {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return undefined;
  const match = trimmed.match(/^(.*?[.!?])(?:\s|$)/);
  if (match?.[1]) return match[1];
  return trimmed.length <= 200 ? trimmed : `${trimmed.slice(0, 197)}…`;
}

/**
 * Truncate text to a maximum length, ending at a word boundary
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 0
    ? truncated.slice(0, lastSpace) + "..."
    : truncated + "...";
}

/**
 * Derive the preview domain for a deployed brain instance.
 *
 * Examples:
 * - yeehaa.io -> preview.yeehaa.io
 * - mylittlephoney.com -> preview.mylittlephoney.com
 * - recall.rizom.ai -> recall-preview.rizom.ai
 */
export function derivePreviewDomain(domain: string): string {
  const normalized = domain.trim().replace(/^https?:\/\//, "");
  const labels = normalized.split(".").filter(Boolean);

  if (labels.length >= 3) {
    const [firstLabel, ...rest] = labels;
    if (!firstLabel || rest.length === 0) {
      return `preview.${normalized}`;
    }
    return `${firstLabel}-preview.${rest.join(".")}`;
  }

  return `preview.${normalized}`;
}
