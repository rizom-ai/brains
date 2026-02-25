import { BaseEntityAdapter } from "@brains/plugins";
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
export class SiteInfoAdapter extends BaseEntityAdapter<
  SiteInfoEntity,
  SiteInfoMetadata
> {
  constructor() {
    super({
      entityType: "site-info",
      schema: siteInfoSchema,
      frontmatterSchema: siteInfoBodySchema,
      isSingleton: true,
      hasBody: false,
    });
  }

  /**
   * Create site info content in frontmatter format
   * Validates input data through Zod schema
   */
  public createSiteInfoContent(
    params: z.input<typeof siteInfoBodySchema>,
  ): string {
    const validatedData = siteInfoBodySchema.parse(params);
    return this.buildMarkdown("", validatedData);
  }

  /**
   * Parse site info body from content
   */
  public parseSiteInfoBody(content: string): SiteInfoBody {
    return this.parseFrontmatter(content) as SiteInfoBody;
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
  public override extractMetadata(_entity: SiteInfoEntity): SiteInfoMetadata {
    return {};
  }

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: SiteInfoEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", data as Record<string, unknown>);
  }
}
