import { BaseEntityAdapter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  siteInfoSchema,
  siteInfoBodySchema,
  type SiteInfoEntity,
  type SiteInfoBody,
  type SiteInfoMetadata,
} from "../schemas/site-info-schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

/**
 * Entity adapter for SiteInfo entities
 * Uses frontmatter format for CMS compatibility
 */
export class SiteInfoAdapter extends BaseEntityAdapter<
  SiteInfoEntity,
  SiteInfoMetadata,
  SiteInfoBody
> {
  constructor() {
    super({
      entityType: "site-info",
      purpose: "Singleton configuration describing the published site.",
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
  public createSiteInfoContent(params: SiteInfoBody): string {
    const validatedData = siteInfoBodySchema.parse(params);
    return this.buildMarkdown("", validatedData);
  }

  /**
   * Parse site info body from content
   */
  public parseSiteInfoBody(content: string): SiteInfoBody {
    return this.parseFrontmatter(content);
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
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
