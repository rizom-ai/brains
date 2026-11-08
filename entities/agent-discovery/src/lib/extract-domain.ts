/**
 * Extract domain from a URL, bare domain, or natural language containing a URL.
 * Returns empty string if no domain can be found.
 */
export function extractDomain(input: string): string {
  const trimmed = input.trim();

  // Direct URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      return new URL(trimmed).hostname;
    } catch {
      return trimmed;
    }
  }

  // URL embedded in natural language (strip trailing punctuation)
  const urlMatch = trimmed.match(/https?:\/\/[^\s]+?(?=[.,;:!?)]*(?:\s|$))/);
  if (urlMatch) {
    try {
      return new URL(urlMatch[0]).hostname;
    } catch {
      return urlMatch[0];
    }
  }

  // Bare domain (contains a dot, no spaces)
  if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
    return trimmed;
  }

  return "";
}
