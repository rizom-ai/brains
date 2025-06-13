import type { EntityAdapter } from "@brains/base-entity";
import { siteContentSchema, type SiteContent } from "./schemas";
import * as yaml from "js-yaml";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  Logger,
} from "@brains/utils";
import { z } from "zod";
import type { ContentTypeRegistry } from "@brains/types";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  page: z.string(),
  section: z.string(),
});

/**
 * Entity adapter for site content with schema validation support
 */
export class SiteContentAdapter implements EntityAdapter<SiteContent> {
  public readonly entityType = "site-content";
  public readonly schema = siteContentSchema;

  private contentTypeRegistry: Pick<ContentTypeRegistry, "get"> | null = null;
  private logger: Logger;

  constructor(logger?: Logger) {
    this.logger = (logger ?? Logger.getInstance()).child("SiteContentAdapter");
  }

  /**
   * Set the content type registry for schema validation
   */
  public setContentTypeRegistry(
    registry: Pick<ContentTypeRegistry, "get">,
  ): void {
    this.contentTypeRegistry = registry;
    this.logger.debug("ContentTypeRegistry set for schema validation");
  }

  public toMarkdown(entity: SiteContent): string {
    // For site-content, the 'data' field is stored as YAML in the content
    // and page/section go in frontmatter
    const metadata = {
      page: entity.page,
      section: entity.section,
    };
    const dataYaml = yaml.dump(entity.data, { indent: 2 });

    // Use frontmatter utility to generate markdown with metadata
    return generateMarkdownWithFrontmatter(dataYaml, metadata);
  }

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    // Parse frontmatter and content
    const { content, metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // Parse YAML content back to data object
    let parsedData: Record<string, unknown> = {};
    try {
      parsedData = yaml.load(content) as Record<string, unknown>;
    } catch (error) {
      // If YAML parsing fails, treat content as plain text
      this.logger.warn("Failed to parse YAML content, treating as plain text", {
        error,
        page: metadata.page,
        section: metadata.section,
      });
      parsedData = { content };
    }

    // Validate against registered schema if available
    if (this.contentTypeRegistry && metadata.page && metadata.section) {
      const contentType = this.resolveContentType(
        metadata.page,
        metadata.section,
      );
      const schema = this.contentTypeRegistry.get(contentType);

      if (schema) {
        this.logger.debug("Validating content against schema", {
          contentType,
          page: metadata.page,
          section: metadata.section,
        });

        try {
          // Validate and parse with proper schema
          parsedData = schema.parse(parsedData) as Record<string, unknown>;
          this.logger.debug("Content validation successful", {
            contentType,
            page: metadata.page,
            section: metadata.section,
          });
        } catch (error) {
          // Log validation error but don't throw - allow backward compatibility
          this.logger.error("Content validation failed", {
            contentType,
            page: metadata.page,
            section: metadata.section,
            error: error instanceof z.ZodError ? error.errors : error,
          });
          // For now, continue with unvalidated data
          // In the future, we might want to throw here
        }
      } else {
        this.logger.debug("No schema found for content type", {
          contentType,
          page: metadata.page,
          section: metadata.section,
        });
      }
    }

    return {
      page: metadata.page,
      section: metadata.section,
      data: parsedData,
    };
  }

  public extractMetadata(entity: SiteContent): Record<string, unknown> {
    return {
      page: entity.page,
      section: entity.section,
    };
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: SiteContent): string {
    const metadata = {
      page: entity.page,
      section: entity.section,
    };
    return generateFrontmatter(metadata);
  }

  /**
   * Resolve content type from page and section
   * Following the plugin:page:component naming convention
   */
  private resolveContentType(page: string, section: string): string {
    return `webserver:${page}:${section}`;
  }
}

// Create a default instance for backward compatibility
export const siteContentAdapter = new SiteContentAdapter();
