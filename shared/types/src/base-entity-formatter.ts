import type { ContentFormatter } from "./formatters";
import type { BaseEntity } from "./entities";

/**
 * Formatter for base entities
 *
 * Provides a formatter for BaseEntity instances,
 * converting them to human-readable markdown representation for display.
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

    // Display metadata if present
    if (entity.metadata && Object.keys(entity.metadata).length > 0) {
      output += "\n## Metadata\n\n";
      for (const [key, value] of Object.entries(entity.metadata)) {
        output += `- **${key}**: ${JSON.stringify(value)}\n`;
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
   * Parse is not supported for BaseEntityFormatter
   * This formatter is for display only. Use BaseEntityAdapter for parsing operations.
   */
  parse(_content: string): BaseEntity {
    throw new Error(
      "BaseEntityFormatter is for display only. Use BaseEntityAdapter for parsing operations.",
    );
  }
}
