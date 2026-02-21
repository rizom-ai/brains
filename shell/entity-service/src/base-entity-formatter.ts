import { stripMarkdown, z, type ContentFormatter } from "@brains/utils";
import type { BaseEntity } from "./types";
import { parseMarkdownWithFrontmatter } from "./frontmatter";

/**
 * Formatter for base entities
 *
 * Provides a formatter for BaseEntity instances,
 * converting them to human-readable markdown representation for display.
 */
export class BaseEntityFormatter implements ContentFormatter<BaseEntity> {
  /**
   * Format a base entity as concise, single-line text
   */
  format(entity: BaseEntity): string {
    const parts: string[] = [];

    // Start with ID in brackets (escaped to prevent markdown interpretation)
    parts.push(`\\[${entity.id}\\]`);

    // Parse content to separate frontmatter from actual content
    let actualContent = entity.content;
    let frontmatter: Record<string, unknown> = {};

    if (entity.content.trim()) {
      try {
        const parsed = parseMarkdownWithFrontmatter(
          entity.content,
          z.record(z.string(), z.unknown()), // Allow any frontmatter structure
        );
        actualContent = parsed.content;
        frontmatter = parsed.metadata;
      } catch {
        // If parsing fails, use content as-is
        actualContent = entity.content;
      }
    }

    // Add content as plain text (after frontmatter is removed)
    if (actualContent.trim()) {
      let content = actualContent.trim();

      // Remove markdown formatting
      content = stripMarkdown(content);

      // Get title from frontmatter
      const title =
        frontmatter["title"] ??
        entity.metadata["title"] ??
        entity.metadata["name"];

      // Remove first line if it matches the title
      if (title) {
        const firstLine = content.split("\n")[0];
        if (
          firstLine &&
          firstLine.trim().toLowerCase() === String(title).toLowerCase()
        ) {
          const lines = content.split("\n");
          content = lines.slice(1).join("\n").trim();
        }
      }

      // Add longer content excerpt - let terminal handle wrapping
      if (content) {
        // Clean up whitespace but keep as single paragraph
        const cleaned = content
          .replace(/\s+/g, " ") // All whitespace to single spaces
          .trim();

        // Provide more content (about 6-7 lines worth at 80 chars per line)
        const truncated =
          cleaned.length > 500 ? cleaned.substring(0, 500) + "..." : cleaned;
        parts.push(truncated);
      }
    }

    return parts.join("\n\n");
  }

  /**
   * Parse is not supported for BaseEntityFormatter
   * This formatter is for display only. Use BaseEntityAdapter for parsing operations.
   */
  parse(_content: string): BaseEntity {
    throw new Error(
      "BaseEntityFormatter is for display only. Use BaseEntityAdapter for parsing operations.",
    );
  }
}
