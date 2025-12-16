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
