import type { EntityAdapter } from "@brains/base-entity";
import type { SiteContentPreview, SiteContentProduction } from "@brains/types";
import {
  siteContentPreviewSchema,
  siteContentProductionSchema,
} from "@brains/types";
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
  // Content origin metadata
  generatedBy: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
});

/**
 * Base entity adapter for site content with shared functionality
 */
abstract class SiteContentAdapter<
  T extends SiteContentPreview | SiteContentProduction,
> implements EntityAdapter<T>
{
  public abstract readonly entityType: string;
  public abstract readonly schema: z.ZodSchema<T>;

  constructor() {
    // No initialization needed
  }

  public toMarkdown(entity: T): string {
    // The content field already contains the formatted content
    // We just need to add/update the frontmatter
    const metadata: Record<string, unknown> = {
      page: entity.page,
      section: entity.section,
    };

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

  public fromMarkdown(markdown: string): Partial<T> {
    // Parse frontmatter to get page and section
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // The content is the formatted markdown
    // For import, we store the full markdown as the source of truth
    const result: Partial<T> = {
      page: metadata.page,
      section: metadata.section,
      content: markdown, // Store the full markdown including frontmatter
    } as Partial<T>;

    return result;
  }

  public extractMetadata(entity: T): Record<string, unknown> {
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

  public generateFrontMatter(entity: T): string {
    const metadata: Record<string, unknown> = {
      page: entity.page,
      section: entity.section,
    };

    return generateFrontmatter(metadata);
  }
}

/**
 * Entity adapter for preview site content
 */
export class SiteContentPreviewAdapter extends SiteContentAdapter<SiteContentPreview> {
  public readonly entityType = "site-content-preview";
  public readonly schema = siteContentPreviewSchema;
}

/**
 * Entity adapter for production site content
 */
export class SiteContentProductionAdapter extends SiteContentAdapter<SiteContentProduction> {
  public readonly entityType = "site-content-production";
  public readonly schema = siteContentProductionSchema;
}

// Create default instances
export const siteContentPreviewAdapter = new SiteContentPreviewAdapter();
export const siteContentProductionAdapter = new SiteContentProductionAdapter();
