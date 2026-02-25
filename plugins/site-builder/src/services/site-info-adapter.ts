import type { EntityAdapter } from "@brains/plugins";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  siteInfoSchema,
  siteInfoBodySchema,
  type SiteInfoEntity,
  type SiteInfoBody,
  type SiteInfoMetadata,
} from "./site-info-schema";

/**
 * Entity adapter for SiteInfo entities
 * Uses frontmatter format for CMS compatibility
 */
export class SiteInfoAdapter
  implements EntityAdapter<SiteInfoEntity, SiteInfoMetadata>
{
  public readonly entityType = "site-info";
  public readonly schema = siteInfoSchema;
  public readonly frontmatterSchema = siteInfoBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = false;

  /**
   * Create site info content in frontmatter format
   * Validates input data through Zod schema
   */
  public createSiteInfoContent(
    params: z.input<typeof siteInfoBodySchema>,
  ): string {
    const validatedData = siteInfoBodySchema.parse(params);
    return generateMarkdownWithFrontmatter("", validatedData);
  }

  /**
   * Parse site info body from content
   */
  public parseSiteInfoBody(content: string): SiteInfoBody {
    return parseMarkdownWithFrontmatter(content, siteInfoBodySchema).metadata;
  }

  /**
   * Convert site info entity to markdown
   * Content is already stored in frontmatter format — pass through as-is
   */
  public toMarkdown(entity: SiteInfoEntity): string {
    return entity.content;
  }

  /**
   * Create partial entity from markdown content
   */
  public fromMarkdown(markdown: string): Partial<SiteInfoEntity> {
    return {
      content: markdown,
      entityType: "site-info",
    };
  }

  /**
   * Extract metadata for search/filtering
   * Site-info doesn't use metadata for filtering
   */
  public extractMetadata(_entity: SiteInfoEntity): SiteInfoMetadata {
    return {};
  }

  /**
   * Parse frontmatter from markdown
   */
  public parseFrontMatter<TFrontmatter>(
    markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    return parseMarkdownWithFrontmatter(markdown, schema).metadata;
  }

  /**
   * Generate frontmatter for the entity
   */
  public generateFrontMatter(entity: SiteInfoEntity): string {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      siteInfoBodySchema,
    ).metadata;
    return generateFrontmatter(data);
  }
}
