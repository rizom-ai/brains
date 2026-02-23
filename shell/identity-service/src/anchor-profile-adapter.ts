import type { EntityAdapter } from "@brains/entity-service";
import {
  FrontmatterContentHelper,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  anchorProfileSchema,
  anchorProfileBodySchema,
  type AnchorProfileEntity,
  type AnchorProfile,
} from "./anchor-profile-schema";

/**
 * Entity adapter for Anchor Profile entities
 * Uses frontmatter format for CMS compatibility
 * Supports reading legacy structured content format for backward compatibility
 */
export class AnchorProfileAdapter
  implements EntityAdapter<AnchorProfileEntity>
{
  public readonly entityType = "anchor-profile";
  public readonly schema = anchorProfileSchema;
  public readonly frontmatterSchema = anchorProfileBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = true;

  // TODO: Remove legacy StructuredContentFormatter support once all sites are converted to frontmatter
  private readonly contentHelper = new FrontmatterContentHelper(
    anchorProfileBodySchema,
    () =>
      new StructuredContentFormatter(anchorProfileBodySchema, {
        title: "Profile",
        mappings: [
          { key: "name", label: "Name", type: "string" },
          { key: "description", label: "Description", type: "string" },
          { key: "avatar", label: "Avatar", type: "string" },
          { key: "website", label: "Website", type: "string" },
          { key: "email", label: "Email", type: "string" },
          {
            key: "socialLinks",
            label: "Social Links",
            type: "array",
            itemType: "object",
            itemMappings: [
              { key: "platform", label: "Platform", type: "string" },
              { key: "url", label: "URL", type: "string" },
              { key: "label", label: "Label", type: "string" },
            ],
          },
        ],
      }),
  );

  /**
   * Create profile content in frontmatter format
   * Validates input data through Zod schema
   */
  public createProfileContent(
    params: z.input<typeof anchorProfileBodySchema>,
  ): string {
    const validatedData = anchorProfileBodySchema.parse(params);
    return this.contentHelper.format(validatedData);
  }

  /**
   * Parse profile body from content (handles both frontmatter and legacy formats)
   */
  public parseProfileBody(content: string): AnchorProfile {
    return this.contentHelper.parse(content);
  }

  /**
   * Convert profile entity to markdown
   * Content is already stored in frontmatter format — pass through as-is
   */
  public toMarkdown(entity: AnchorProfileEntity): string {
    return entity.content;
  }

  /**
   * Create partial entity from markdown content
   * Preserves frontmatter as-is to avoid stripping extension fields (e.g., tagline, expertise)
   * Only converts legacy structured content format
   */
  public fromMarkdown(markdown: string): Partial<AnchorProfileEntity> {
    return {
      content: markdown.startsWith("---")
        ? markdown
        : this.contentHelper.convertToFrontmatter(markdown),
      entityType: "anchor-profile",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: AnchorProfileEntity): Record<string, unknown> {
    const data = this.contentHelper.parse(entity.content);
    return {
      name: data.name,
      email: data.email,
      website: data.website,
    };
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
  public generateFrontMatter(entity: AnchorProfileEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.toFrontmatterString(data);
  }
}
