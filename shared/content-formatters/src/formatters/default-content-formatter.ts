import type { ContentFormatter } from "../types";
import * as yaml from "js-yaml";

/**
 * Default content formatter that uses YAML for any structured content
 */
export class DefaultContentFormatter implements ContentFormatter<unknown> {
  public format(data: unknown): string {
    // Handle different data types appropriately
    if (data === null || data === undefined) {
      return "";
    }

    // For strings, return as-is
    if (typeof data === "string") {
      return data;
    }

    // For objects and arrays, use YAML formatting
    try {
      return yaml.dump(data, {
        indent: 2,
        lineWidth: -1, // Disable line wrapping
        sortKeys: false, // Preserve key order
      });
    } catch {
      // Fallback to JSON if YAML fails
      return JSON.stringify(data, null, 2);
    }
  }

  public parse(content: string): unknown {
    // Try to parse as YAML first
    try {
      return yaml.load(content);
    } catch {
      // Try JSON if YAML fails
      try {
        return JSON.parse(content);
      } catch {
        // Return as plain text if both fail
        return content;
      }
    }
  }
}

// Singleton instance for convenience
let defaultFormatter: DefaultContentFormatter | null = null;

/**
 * Get the default content formatter instance
 */
export function getDefaultContentFormatter(): DefaultContentFormatter {
  defaultFormatter ??= new DefaultContentFormatter();
  return defaultFormatter;
}
