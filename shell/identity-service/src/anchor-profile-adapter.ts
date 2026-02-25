import type { EntityAdapter } from "@brains/entity-service";
import {
  parseMarkdownWithFrontmatter,
  generateMarkdownWithFrontmatter,
  generateFrontmatter,
} from "@brains/entity-service";
import type { z } from "@brains/utils";
import {
  anchorProfileSchema,
  anchorProfileBodySchema,
  type AnchorProfileEntity,
  type AnchorProfile,
} from "./anchor-profile-schema";

/**
 * Entity adapter for Anchor Profile entities
 * Uses frontmatter format for CMS compatibility
 */
export class AnchorProfileAdapter
  implements EntityAdapter<AnchorProfileEntity>
{
  public readonly entityType = "anchor-profile";
  public readonly schema = anchorProfileSchema;
  public readonly frontmatterSchema = anchorProfileBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = true;

  /**
   * Create profile content in frontmatter format
   * Validates input data through Zod schema
   */
  public createProfileContent(
    params: z.input<typeof anchorProfileBodySchema>,
  ): string {
    const validatedData = anchorProfileBodySchema.parse(params);
    return generateMarkdownWithFrontmatter("", validatedData);
  }

  /**
   * Parse profile body from content
   */
  public parseProfileBody(content: string): AnchorProfile {
    return parseMarkdownWithFrontmatter(content, anchorProfileBodySchema)
      .metadata;
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
   */
  public fromMarkdown(markdown: string): Partial<AnchorProfileEntity> {
    return {
      content: markdown,
      entityType: "anchor-profile",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: AnchorProfileEntity): Record<string, unknown> {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      anchorProfileBodySchema,
    ).metadata;
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
    return parseMarkdownWithFrontmatter(markdown, schema).metadata;
  }

  /**
   * Generate frontmatter for the entity
   */
  public generateFrontMatter(entity: AnchorProfileEntity): string {
    const data = parseMarkdownWithFrontmatter(
      entity.content,
      anchorProfileBodySchema,
    ).metadata;
    return generateFrontmatter(data);
  }
}
