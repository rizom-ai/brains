import type { ContentFormatter } from "@brains/types";
import { hasProps } from "./utils";

/**
 * Base formatter for API/query responses with common utilities
 * Implements ContentFormatter but throws on parse() since responses are read-only
 */
export abstract class ResponseFormatter<T = unknown>
  implements ContentFormatter<T>
{
  abstract format(data: T): string;
  abstract canFormat(data: unknown): boolean;

  /**
   * Parse is not supported for response formatters
   * @throws Error always - response formats are read-only
   */
  parse(_content: string): T {
    throw new Error(
      "This response format is read-only and cannot be parsed back to data",
    );
  }

  /**
   * Format a key-value pair as markdown
   */
  protected formatKeyValue(key: string, value: unknown): string {
    if (value === undefined || value === null) return "";
    return `**${key}:** ${String(value)}`;
  }

  /**
   * Format a list as markdown bullets
   */
  protected formatList(items: unknown[]): string {
    return items.map((item) => `- ${String(item)}`).join("\n");
  }

  /**
   * Format a table as markdown
   */
  protected formatTable(headers: string[], rows: unknown[][]): string {
    const headerRow = `| ${headers.join(" | ")} |`;
    const separator = `| ${headers.map(() => "---").join(" | ")} |`;
    const dataRows = rows
      .map((row) => `| ${row.map((cell) => String(cell ?? "")).join(" | ")} |`)
      .join("\n");

    return `${headerRow}\n${separator}\n${dataRows}`;
  }

  /**
   * Format a code block
   */
  protected formatCodeBlock(code: string, language = ""): string {
    return `\`\`\`${language}\n${code}\n\`\`\``;
  }

  /**
   * Check if value is an object with specific fields
   */
  protected hasFields(data: unknown, fields: string[]): boolean {
    return hasProps(data, fields);
  }

  /**
   * Format an error message
   */
  protected formatError(message: string): string {
    return `Error: ${message}`;
  }
}
