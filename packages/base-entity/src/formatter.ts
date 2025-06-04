import type { SchemaFormatter } from "@brains/types";
import type { BaseEntity } from "@brains/types";
import { parseMarkdown } from "@brains/utils";

/**
 * Formatter for base entities
 *
 * Provides a basic formatter for BaseEntity instances,
 * displaying database fields and frontmatter separately.
 */
export class BaseEntityFormatter implements SchemaFormatter {
  /**
   * Format a base entity as markdown
   */
  format(data: unknown): string {
    if (!this.canFormat(data)) {
      return String(data);
    }

    const entity = data as BaseEntity;
    let output = "";

    // Display entity header
    output += `# Entity: ${entity.id}\n\n`;

    // Display core fields
    output += "## Core Fields\n\n";
    output += `- **ID**: ${entity.id}\n`;
    output += `- **Type**: ${entity.entityType}\n`;

    if (entity.created) {
      try {
        const createdDate = new Date(entity.created);
        output += `- **Created**: ${createdDate.toLocaleString()}\n`;
      } catch {
        output += `- **Created**: ${entity.created}\n`;
      }
    }

    if (entity.updated) {
      try {
        const updatedDate = new Date(entity.updated);
        output += `- **Updated**: ${updatedDate.toLocaleString()}\n`;
      } catch {
        output += `- **Updated**: ${entity.updated}\n`;
      }
    }

    // If there's content, extract and display frontmatter and content separately
    if (entity.content) {
      const { frontmatter, content } = parseMarkdown(entity.content);

      // Display frontmatter as JSON
      if (Object.keys(frontmatter).length > 0) {
        output += "\n## Frontmatter\n\n";
        output += "```json\n";
        output += JSON.stringify(frontmatter, null, 2);
        output += "\n```\n";
      }

      // Display content
      if (content.trim().length > 0) {
        output += "\n## Content\n\n";
        output += content;
      }
    }

    return output;
  }

  /**
   * Check if this formatter can handle the data
   */
  canFormat(data: unknown): boolean {
    return (
      typeof data === "object" &&
      data !== null &&
      "id" in data &&
      "entityType" in data
    );
  }
}
