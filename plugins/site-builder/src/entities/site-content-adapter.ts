import type { EntityAdapter } from "@brains/plugins";
import type { SiteContent, SiteContentMetadata } from "../types";
import { siteContentSchema } from "../types";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import { z } from "@brains/utils";

// Schema for parsing frontmatter
const frontmatterSchema = z.object({
  routeId: z.string(),
  sectionId: z.string(),
  // Content origin metadata
  generatedBy: z.string().optional(),
  generatedAt: z.string().datetime().optional(),
});

/**
 * Entity adapter for site content
 */
export class SiteContentAdapter
  implements EntityAdapter<SiteContent, SiteContentMetadata>
{
  public readonly entityType = "site-content";
  public readonly schema = siteContentSchema;

  constructor() {
    // No initialization needed
  }

  public toMarkdown(entity: SiteContent): string {
    // The content field already contains the formatted content
    // We just need to add/update the frontmatter
    const metadata: Record<string, unknown> = {
      routeId: entity.routeId,
      sectionId: entity.sectionId,
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

  public fromMarkdown(markdown: string): Partial<SiteContent> {
    // Parse frontmatter to get routeId and sectionId
    const { metadata } = parseMarkdownWithFrontmatter(
      markdown,
      frontmatterSchema,
    );

    // The content is the formatted markdown
    // For import, we store the full markdown as the source of truth
    const result: Partial<SiteContent> = {
      routeId: metadata.routeId,
      sectionId: metadata.sectionId,
      content: markdown, // Store the full markdown including frontmatter
    };

    return result;
  }

  public extractMetadata(_entity: SiteContent): SiteContentMetadata {
    return {};
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
      routeId: entity.routeId,
      sectionId: entity.sectionId,
    };

    return generateFrontmatter(metadata);
  }
}

// Create default instance
export const siteContentAdapter = new SiteContentAdapter();
