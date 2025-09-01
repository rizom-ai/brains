import { createHash } from "crypto";

/**
 * Utility class for URL processing and deterministic ID generation
 */
export class UrlUtils {
  // Comprehensive URL regex pattern - excludes common punctuation at the end
  private static readonly URL_PATTERN =
    /https?:\/\/[^\s<>"{}|\\^`[\]]+?(?=[,;:\s]|$)/gi;

  /**
   * Extract URLs from text
   */
  static extractUrls(text: string): string[] {
    const matches = text.match(UrlUtils.URL_PATTERN) ?? [];
    return [...new Set(matches)]; // Remove duplicates within message
  }

  /**
   * Normalize URL for deduplication (remove query params and fragments)
   */
  static normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Keep only protocol, host, and pathname
      // Remove trailing slash from pathname for consistency
      const pathname = parsed.pathname.replace(/\/$/, "") || "/";
      return `${parsed.protocol}//${parsed.host}${pathname}`;
    } catch {
      return url;
    }
  }

  /**
   * Generate deterministic entity ID from URL
   * Format: "{domain}-{hash[:6]}"
   * Example: "github-com-a3f5d9"
   */
  static generateEntityId(url: string): string {
    const normalized = this.normalizeUrl(url);
    const hash = createHash("sha256").update(normalized).digest("hex");

    try {
      const parsed = new URL(normalized);
      // Clean domain name for ID (remove dots, keep hyphens)
      const domain = parsed.hostname.replace(/\./g, "-");
      return `${domain}-${hash.substring(0, 6)}`;
    } catch {
      // Fallback to just hash if URL parsing fails
      return hash.substring(0, 12);
    }
  }

  /**
   * Validate URL format
   */
  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ["http:", "https:"].includes(parsed.protocol);
    } catch {
      return false;
    }
  }
}
