import type { EntityAdapter } from "@brains/plugins";
import {
  FrontmatterContentHelper,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import { StructuredContentFormatter, type z } from "@brains/utils";
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
 * Supports reading legacy structured content format for backward compatibility
 */
export class SiteInfoAdapter
  implements EntityAdapter<SiteInfoEntity, SiteInfoMetadata>
{
  public readonly entityType = "site-info";
  public readonly schema = siteInfoSchema;
  public readonly frontmatterSchema = siteInfoBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = false;

  private readonly contentHelper = new FrontmatterContentHelper(
    siteInfoBodySchema,
    () =>
      new StructuredContentFormatter(siteInfoBodySchema, {
        title: "Site Information",
        mappings: [
          { key: "title", label: "Title", type: "string" },
          { key: "description", label: "Description", type: "string" },
          {
            key: "logo",
            label: "Logo",
            type: "custom",
            formatter: (value: unknown): string => String(value),
            parser: (text: string): boolean =>
              text.trim().toLowerCase() === "true",
          },
          { key: "copyright", label: "Copyright", type: "string" },
          { key: "themeMode", label: "Theme Mode", type: "string" },
          {
            key: "cta",
            label: "CTA",
            type: "object",
            children: [
              { key: "heading", label: "Heading", type: "string" },
              { key: "buttonText", label: "Button Text", type: "string" },
              { key: "buttonLink", label: "Button Link", type: "string" },
            ],
          },
        ],
      }),
  );

  /**
   * Create site info content in frontmatter format
   * Validates input data through Zod schema
   */
  public createSiteInfoContent(
    params: z.input<typeof siteInfoBodySchema>,
  ): string {
    const validatedData = siteInfoBodySchema.parse(params);
    return this.contentHelper.format(validatedData);
  }

  /**
   * Parse site info body from content (handles both frontmatter and legacy formats)
   */
  public parseSiteInfoBody(content: string): SiteInfoBody {
    return this.contentHelper.parse(content);
  }

  /**
   * Convert site info entity to frontmatter markdown
   */
  public toMarkdown(entity: SiteInfoEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.format(data);
  }

  /**
   * Create partial entity from markdown content
   * Auto-converts legacy structured content to frontmatter format
   */
  public fromMarkdown(markdown: string): Partial<SiteInfoEntity> {
    return {
      content: this.contentHelper.convertToFrontmatter(markdown),
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
    const { metadata } = parseMarkdownWithFrontmatter(markdown, schema);
    return metadata;
  }

  /**
   * Generate frontmatter for the entity
   */
  public generateFrontMatter(entity: SiteInfoEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.toFrontmatterString(data);
  }
}
