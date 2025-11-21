import type { EntityAdapter } from "@brains/entity-service";
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
 * Uses structured content formatting - all data in markdown body, no frontmatter
 */
export class SiteInfoAdapter
  implements EntityAdapter<SiteInfoEntity, SiteInfoMetadata>
{
  public readonly entityType = "site-info";
  public readonly schema = siteInfoSchema;

  /**
   * Create formatter for site info content
   * Dynamically include only fields that are present
   */
  private createFormatter(
    data?: Partial<SiteInfoBody>,
  ): StructuredContentFormatter<SiteInfoBody> {
    const mappings: Array<{
      key: string;
      label: string;
      type: "string" | "object" | "array" | "custom";
      children?: Array<{ key: string; label: string; type: "string" }>;
      itemType?: "object";
      itemMappings?: Array<{ key: string; label: string; type: "string" }>;
      formatter?: (value: unknown) => string;
      parser?: (text: string) => unknown;
    }> = [
      { key: "title", label: "Title", type: "string" },
      { key: "description", label: "Description", type: "string" },
    ];

    // Add optional fields only if they have values
    if (!data || data.logo !== undefined) {
      mappings.push({
        key: "logo",
        label: "Logo",
        type: "custom",
        formatter: (value: unknown) => String(value),
        parser: (text: string) => text.trim().toLowerCase() === "true",
      });
    }
    if (!data || data.copyright !== undefined) {
      mappings.push({ key: "copyright", label: "Copyright", type: "string" });
    }
    if (!data || data.themeMode !== undefined) {
      mappings.push({ key: "themeMode", label: "Theme Mode", type: "string" });
    }
    if (!data || data.cta !== undefined) {
      mappings.push({
        key: "cta",
        label: "CTA",
        type: "object",
        children: [
          { key: "heading", label: "Heading", type: "string" },
          { key: "buttonText", label: "Button Text", type: "string" },
          { key: "buttonLink", label: "Button Link", type: "string" },
        ],
      });
    }

    return new StructuredContentFormatter(siteInfoBodySchema, {
      title: "Site Information",
      mappings,
    });
  }

  /**
   * Create site info content from components
   * Validates input data through Zod schema
   */
  public createSiteInfoContent(
    params: z.input<typeof siteInfoBodySchema>,
  ): string {
    // Validate and normalize through Zod schema
    const validatedData = siteInfoBodySchema.parse(params);
    const formatter = this.createFormatter(validatedData);
    return formatter.format(validatedData);
  }

  /**
   * Parse site info body from content
   */
  public parseSiteInfoBody(content: string): SiteInfoBody {
    // When parsing, include all possible fields
    const formatter = this.createFormatter();
    return formatter.parse(content);
  }

  /**
   * Convert site info entity to markdown with structured content
   */
  public toMarkdown(entity: SiteInfoEntity): string {
    // Parse existing content to get site info data
    const siteInfoData = this.parseSiteInfoBody(entity.content);

    const formatter = this.createFormatter(siteInfoData);
    return formatter.format(siteInfoData);
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
   * Parse frontmatter - not used for site-info (returns empty object)
   */
  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    _schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Site info doesn't use frontmatter
    return {} as TFrontmatter;
  }

  /**
   * Generate frontmatter - not used for site-info (returns empty string)
   */
  public generateFrontMatter(_entity: SiteInfoEntity): string {
    // Site info doesn't use frontmatter
    return "";
  }
}
