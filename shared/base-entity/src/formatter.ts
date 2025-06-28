import type { ContentFormatter } from "@brains/types";
import type { BaseEntity } from "@brains/types";

/**
 * Formatter for base entities
 *
 * Provides a bidirectional formatter for BaseEntity instances,
 * converting between BaseEntity objects and markdown representation.
 */
export class BaseEntityFormatter implements ContentFormatter<BaseEntity> {
  /**
   * Format a base entity as markdown
   */
  format(data: BaseEntity): string {
    const entity = data;
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

    // Display content
    if (entity.content && entity.content.trim().length > 0) {
      output += "\n## Content\n\n";
      output += entity.content;
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

  /**
   * Parse is not supported for BaseEntityFormatter
   * @throws Error always - use BaseEntityAdapter for import/export operations
   */
  parse(_content: string): BaseEntity {
    throw new Error(
      "BaseEntityFormatter is for display only. Use BaseEntityAdapter for import/export operations.",
    );
  }
}
