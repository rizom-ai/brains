import type { z } from "zod";
import type { EntityAdapter } from "@brains/base-entity";
import type { GeneratedContent } from "@brains/types";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/utils";
import { generatedContentSchema, generatedContentMetadataSchema } from "@brains/types";

export class GeneratedContentAdapter
  implements EntityAdapter<GeneratedContent>
{
  public readonly entityType = "generated-content";
  public readonly schema = generatedContentSchema;

  public toMarkdown(entity: GeneratedContent): string {
    const frontmatter = {
      id: entity.id,
      entityType: entity.entityType,
      contentType: entity.contentType,
      schemaName: entity.schemaName,
      data: entity.data, // Store the actual data in frontmatter
      metadata: entity.metadata,
      created: entity.created,
      updated: entity.updated,
    };

    // The content can be a human-readable summary
    const content = this.formatSummary(entity);

    return generateMarkdownWithFrontmatter(content, frontmatter);
  }

  public fromMarkdown(markdown: string): Partial<GeneratedContent> {
    // For generated-content, all structural data is stored in the database metadata column
    // The markdown only contains human-readable content
    // Frontmatter is included for portability but not used for reconstruction
    return {};
  }

  public extractMetadata(entity: GeneratedContent): Record<string, unknown> {
    return {
      contentType: entity.contentType,
      schemaName: entity.schemaName,
      data: entity.data,
      metadata: entity.metadata,
    };
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: GeneratedContent): string {
    const frontmatter = {
      id: entity.id,
      entityType: entity.entityType,
      contentType: entity.contentType,
      schemaName: entity.schemaName,
      data: entity.data,
      metadata: entity.metadata,
      created: entity.created,
      updated: entity.updated,
    };

    return generateFrontmatter(frontmatter);
  }

  private formatSummary(entity: GeneratedContent): string {
    const lines: string[] = [];

    // Header
    lines.push(`# ${entity.contentType}`);
    lines.push("");
    lines.push(`Generated using schema: ${entity.schemaName}`);
    lines.push(`Date: ${entity.metadata.generatedAt}`);
    if (entity.metadata.generatedBy) {
      lines.push(`Model: ${entity.metadata.generatedBy}`);
    }
    lines.push("");

    // Prompt used
    lines.push("## Prompt");
    lines.push("");
    lines.push(entity.metadata.prompt);
    lines.push("");

    // Simple summary of what was generated
    lines.push("## Summary");
    lines.push("");
    lines.push(
      `This file contains generated content of type "${entity.contentType}".`,
    );
    lines.push(
      `The full generated data is stored in the frontmatter of this file.`,
    );

    return lines.join("\n");
  }
}
