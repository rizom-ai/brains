import { z } from "zod";
import type { EntityAdapter } from "@brains/base-entity";
import type { GeneratedContent, ContentFormatter } from "@brains/types";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/utils";
import {
  generatedContentSchema,
  generatedContentMetadataSchema,
} from "@brains/types";
import { DefaultYamlFormatter } from "./formatters/defaultYamlFormatter";

/**
 * Interface for generated content adapter
 * Extends EntityAdapter with formatter support
 */
export interface IGeneratedContentAdapter
  extends EntityAdapter<GeneratedContent> {
  /**
   * Parse content body for editing existing entities
   */
  parseContent(content: string, contentType: string): ParseResult;

  /**
   * Register a formatter for a specific content type
   */
  setFormatter(contentType: string, formatter: ContentFormatter<unknown>): void;
}

// Type for parseContent return value
export type ParseResult = {
  data: Record<string, unknown>;
  validationStatus: "valid" | "invalid";
  validationErrors?: Array<{ message: string }>;
};

// Schema for frontmatter when parsing markdown files (expects strings for dates)
const generatedContentFrontmatterSchema = z
  .object({
    id: z.string(),
    entityType: z.literal("generated-content"),
    contentType: z.string(),
    metadata: generatedContentMetadataSchema.partial().optional().default({}),
    created: z.string(),
    updated: z.string(),
  })
  .passthrough(); // Allow extra fields

export class GeneratedContentAdapter implements IGeneratedContentAdapter {
  public readonly entityType = "generated-content";
  public readonly schema = generatedContentSchema;

  private formatters = new Map<string, ContentFormatter<unknown>>();
  private defaultFormatter = new DefaultYamlFormatter();

  public toMarkdown(entity: GeneratedContent): string {
    // Always use a formatter - specific or default
    const formatter =
      this.formatters.get(entity.contentType) ?? this.defaultFormatter;

    // Data always goes in body, never in frontmatter
    const frontmatter = {
      id: entity.id,
      entityType: entity.entityType,
      contentType: entity.contentType,
      metadata: entity.metadata,
      created: entity.created,
      updated: entity.updated,
      // Note: data is NOT in frontmatter anymore
    };

    const content = formatter.format(entity.data);
    return generateMarkdownWithFrontmatter(content, frontmatter);
  }

  /**
   * Parse content body for editing existing entities
   * Used when user edits the markdown content
   */
  public parseContent(content: string, contentType: string): ParseResult {
    const formatter = this.formatters.get(contentType) ?? this.defaultFormatter;

    try {
      const data = formatter.parse(content);
      return {
        data: data as Record<string, unknown>,
        validationStatus: "valid" as const,
      };
    } catch (error) {
      return {
        data: {}, // Return empty object as fallback
        validationStatus: "invalid" as const,
        validationErrors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      };
    }
  }

  /**
   * Parse full markdown file for import/sync operations
   * Used when importing from git or other sources
   */
  public fromMarkdown(markdown: string): Partial<GeneratedContent> {
    // Parse with our frontmatter schema for type safety
    const parsed = parseMarkdownWithFrontmatter(
      markdown,
      generatedContentFrontmatterSchema,
    );
    const frontmatter = parsed.metadata;
    const content = parsed.content;

    // Use parseContent to handle the body
    const parseResult = this.parseContent(
      content,
      frontmatter.contentType || "unknown",
    );

    return {
      id: frontmatter.id,
      entityType: "generated-content",
      contentType: frontmatter.contentType,
      data: parseResult.data,
      content: markdown, // Store the full markdown
      metadata: {
        prompt: frontmatter.metadata?.prompt ?? "",
        generatedAt:
          frontmatter.metadata?.generatedAt ?? new Date().toISOString(),
        generatedBy: frontmatter.metadata?.generatedBy ?? "unknown",
        regenerated: frontmatter.metadata?.regenerated ?? false,
        validationStatus: parseResult.validationStatus,
        ...(frontmatter.metadata?.context !== undefined && {
          context: frontmatter.metadata.context,
        }),
        ...(frontmatter.metadata?.previousVersionId !== undefined && {
          previousVersionId: frontmatter.metadata.previousVersionId,
        }),
        ...(parseResult.validationErrors !== undefined && {
          validationErrors: parseResult.validationErrors,
        }),
        ...(parseResult.validationStatus === "valid"
          ? { lastValidData: parseResult.data }
          : frontmatter.metadata?.lastValidData !== undefined && {
              lastValidData: frontmatter.metadata.lastValidData,
            }),
      },
      created: frontmatter.created,
      updated: frontmatter.updated,
    };
  }

  public extractMetadata(entity: GeneratedContent): Record<string, unknown> {
    return {
      contentType: entity.contentType,
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
      data: entity.data,
      metadata: entity.metadata,
      created: entity.created,
      updated: entity.updated,
    };

    return generateFrontmatter(frontmatter);
  }

  /**
   * Register a formatter for a specific content type
   */
  public setFormatter(
    contentType: string,
    formatter: ContentFormatter<unknown>,
  ): void {
    this.formatters.set(contentType, formatter);
  }
}
