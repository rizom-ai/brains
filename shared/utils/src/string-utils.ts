/**
 * String utility functions
 */

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
 * Simple English pluralization for common cases
 * Handles: -y → -ies, -s/-x/-ch → -es, default → -s
 */
export function pluralize(word: string): string {
  // Handle common cases
  if (word.endsWith("y")) {
    return word.slice(0, -1) + "ies";
  }
  if (word.endsWith("s") || word.endsWith("x") || word.endsWith("ch")) {
    return word + "es";
  }
  return word + "s";
}
