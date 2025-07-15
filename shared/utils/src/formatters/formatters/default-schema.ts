import type { SchemaFormatter } from "../types";

/**
 * Default formatter - simple fallback for any data
 *
 * Checks for common display fields, otherwise returns JSON.
 * Specific formatters should handle rich formatting.
 */
export class DefaultSchemaFormatter implements SchemaFormatter<unknown> {
  /**
   * Format any data into readable text
   */
  public format(data: unknown): string {
    // Handle primitives first
    if (typeof data === "string") return data;
    if (typeof data === "number") return String(data);
    if (typeof data === "boolean") return data ? "true" : "false";
    if (data === null) return "null";
    if (data === undefined) return "";

    // Check if it's an object with display fields
    if (typeof data === "object") {
      // Type-safe field access
      if ("message" in data && typeof data.message === "string") {
        return data.message;
      }

      if ("text" in data && typeof data.text === "string") {
        return data.text;
      }

      if ("display" in data && typeof data.display === "string") {
        return data.display;
      }
    }

    // For objects and arrays, return formatted JSON
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "[Unable to format data]";
    }
  }

  /**
   * Default formatter can handle any data
   */
  public canFormat(_data: unknown): boolean {
    return true;
  }
}
