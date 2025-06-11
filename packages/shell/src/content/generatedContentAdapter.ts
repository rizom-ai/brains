import { z } from "zod";
import type { EntityAdapter } from "@brains/base-entity";
import type { GeneratedContent, ContentFormatter } from "@brains/types";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
  Logger,
} from "@brains/utils";
import { generatedContentSchema } from "@brains/types";
import { DefaultYamlFormatter } from "@brains/formatters";
import type { ContentTypeRegistry } from "./contentTypeRegistry";

/**
 * Interface for generated content adapter
 * Extends EntityAdapter with formatter support
 * Note: Generated content is immutable - no parsing/editing support
 */
export interface IGeneratedContentAdapter
  extends EntityAdapter<GeneratedContent> {
  /**
   * Register a formatter for a specific content type
   */
  setFormatter(contentType: string, formatter: ContentFormatter<unknown>): void;

  /**
   * Set the content type registry for accessing plugin-registered formatters
   */
  setContentTypeRegistry(registry: ContentTypeRegistry): void;
}

// Schema for frontmatter when parsing markdown files (expects strings for dates)
const generatedContentFrontmatterSchema = z.object({
  id: z.string(),
  entityType: z.literal("generated-content"),
  contentType: z.string(),
  generatedBy: z.string(),
  created: z.string(),
  updated: z.string(),
});

export class GeneratedContentAdapter implements IGeneratedContentAdapter {
  public readonly entityType = "generated-content";
  public readonly schema = generatedContentSchema;

  private formatters = new Map<string, ContentFormatter<unknown>>();
  private defaultFormatter = new DefaultYamlFormatter();
  private contentTypeRegistry: {
    getFormatter(contentType: string): ContentFormatter<unknown> | null;
  } | null = null;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? Logger.getInstance()).child("GeneratedContentAdapter");
  }

  /**
   * Set the content type registry for looking up formatters
   */
  public setContentTypeRegistry(registry: {
    getFormatter(contentType: string): ContentFormatter<unknown> | null;
  }): void {
    this.contentTypeRegistry = registry;
  }

  public toMarkdown(entity: GeneratedContent): string {
    const frontmatter = {
      id: entity.id,
      entityType: entity.entityType,
      contentType: entity.contentType,
      generatedBy: entity.generatedBy,
      created: entity.created,
      updated: entity.updated,
    };

    // Extract just the body content (remove frontmatter if present)
    let content: string;
    try {
      const parsed = parseMarkdownWithFrontmatter(
        entity.content || "",
        generatedContentFrontmatterSchema,
      );
      content = parsed.content;
    } catch {
      // If parsing fails, assume the whole content is the body
      content = entity.content || "";
    }

    return generateMarkdownWithFrontmatter(content, frontmatter);
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

    // Validate content can be parsed (but don't return the data)
    let formatter = this.formatters.get(frontmatter.contentType);
    
    if (!formatter && this.contentTypeRegistry) {
      const registryFormatter = this.contentTypeRegistry.getFormatter(
        frontmatter.contentType,
      );
      if (registryFormatter) {
        formatter = registryFormatter;
      }
    }
    
    formatter ??= this.defaultFormatter;

    try {
      formatter.parse(content); // Validation only
    } catch (error) {
      // Content parsing failed, but we still import it
      // since generated content is immutable
      this.logger.warn(
        `Failed to parse content for ${frontmatter.contentType} (${frontmatter.id})`,
        { contentType: frontmatter.contentType, id: frontmatter.id, error }
      );
    }

    return {
      id: frontmatter.id,
      entityType: "generated-content" as const,
      contentType: frontmatter.contentType,
      content: markdown, // Store the full markdown
      generatedBy: frontmatter.generatedBy,
      created: frontmatter.created,
      updated: frontmatter.updated,
    };
  }

  public extractMetadata(entity: GeneratedContent): Record<string, unknown> {
    return {
      contentType: entity.contentType,
      generatedBy: entity.generatedBy,
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
      generatedBy: entity.generatedBy,
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
