import type { EntityAdapter } from "@brains/base-entity";
import { siteContentSchema, type SiteContent } from "./schemas";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/utils";
import { z } from "zod";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  page: z.string(),
  section: z.string(),
  environment: z.enum(["preview", "production"]).optional(),
  // Content origin metadata
  generatedBy: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
  // Promotion metadata
  promotedAt: z.string().optional(),
  promotedBy: z.string().optional(),
  promotedFrom: z.string().optional(),
});

/**
 * Entity adapter for site content with schema validation support
 */
export class SiteContentAdapter implements EntityAdapter<SiteContent> {
  public readonly entityType = "site-content";
  public readonly schema = siteContentSchema;

  constructor() {
    // No initialization needed
  }

  public toMarkdown(entity: SiteContent): string {
    // The content field already contains the formatted content
    // We just need to add/update the frontmatter
    const metadata: Record<string, unknown> = {
      page: entity.page,
      section: entity.section,
      environment: entity.environment,
    };

    // Add promotion metadata if present
    if (entity.promotionMetadata) {
      if (entity.promotionMetadata.promotedAt) {
        metadata["promotedAt"] = entity.promotionMetadata.promotedAt;
      }
      if (entity.promotionMetadata.promotedBy) {
        metadata["promotedBy"] = entity.promotionMetadata.promotedBy;
      }
      if (entity.promotionMetadata.promotedFrom) {
        metadata["promotedFrom"] = entity.promotionMetadata.promotedFrom;
      }
    }

    // If content already has frontmatter, preserve the body and update metadata
    // Otherwise, use the content as-is
    try {
      const { content: body } = parseMarkdownWithFrontmatter(
        entity.content,
        z.object({}),
      );
      return generateMarkdownWithFrontmatter(body, metadata);
    } catch {
      // Content doesn't have valid frontmatter, use as-is
      return generateMarkdownWithFrontmatter(entity.content, metadata);
    }
  }

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    // Parse frontmatter to get page and section
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // The content is the formatted markdown
    // For import, we store the full markdown as the source of truth
    const result: Partial<SiteContent> = {
      page: metadata.page,
      section: metadata.section,
      content: markdown, // Store the full markdown including frontmatter
      environment: metadata.environment ?? "preview", // Use stored environment or default to preview
    };

    // Include promotion metadata if present
    if (metadata.promotedAt || metadata.promotedBy || metadata.promotedFrom) {
      result.promotionMetadata = {
        promotedAt: metadata.promotedAt,
        promotedBy: metadata.promotedBy,
        promotedFrom: metadata.promotedFrom,
      };
    }

    return result;
  }

  public extractMetadata(entity: SiteContent): Record<string, unknown> {
    const metadata: Record<string, unknown> = {
      page: entity.page,
      section: entity.section,
      environment: entity.environment,
    };

    // Include promotion metadata if present
    if (entity.promotionMetadata) {
      if (entity.promotionMetadata.promotedAt) {
        metadata["promotedAt"] = entity.promotionMetadata.promotedAt;
      }
      if (entity.promotionMetadata.promotedBy) {
        metadata["promotedBy"] = entity.promotionMetadata.promotedBy;
      }
      if (entity.promotionMetadata.promotedFrom) {
        metadata["promotedFrom"] = entity.promotionMetadata.promotedFrom;
      }
    }

    return metadata;
  }

  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  public generateFrontMatter(entity: SiteContent): string {
    const metadata: Record<string, unknown> = {
      page: entity.page,
      section: entity.section,
      environment: entity.environment,
    };

    // Include promotion metadata if present
    if (entity.promotionMetadata) {
      if (entity.promotionMetadata.promotedAt) {
        metadata["promotedAt"] = entity.promotionMetadata.promotedAt;
      }
      if (entity.promotionMetadata.promotedBy) {
        metadata["promotedBy"] = entity.promotionMetadata.promotedBy;
      }
      if (entity.promotionMetadata.promotedFrom) {
        metadata["promotedFrom"] = entity.promotionMetadata.promotedFrom;
      }
    }

    return generateFrontmatter(metadata);
  }
}

// Create a default instance for backward compatibility
export const siteContentAdapter = new SiteContentAdapter();
