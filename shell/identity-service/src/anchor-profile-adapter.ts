import { BaseEntityAdapter } from "@brains/entity-service";
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
export class AnchorProfileAdapter extends BaseEntityAdapter<AnchorProfileEntity> {
  constructor() {
    super({
      entityType: "anchor-profile",
      schema: anchorProfileSchema,
      frontmatterSchema: anchorProfileBodySchema,
      isSingleton: true,
      hasBody: true,
    });
  }

  /**
   * Create profile content in frontmatter format
   * Validates input data through Zod schema
   */
  public createProfileContent(
    params: z.input<typeof anchorProfileBodySchema>,
  ): string {
    const validatedData = anchorProfileBodySchema.parse(params);
    return this.buildMarkdown("", validatedData);
  }

  /**
   * Parse profile body from content
   */
  public parseProfileBody(content: string): AnchorProfile {
    return this.parseFrontmatter(content) as AnchorProfile;
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
  public override extractMetadata(
    entity: AnchorProfileEntity,
  ): Record<string, unknown> {
    const data = this.parseFrontmatter(entity.content) as AnchorProfile;
    return {
      name: data.name,
      email: data.email,
      website: data.website,
    };
  }

  /**
   * Generate frontmatter for the entity
   */
  public override generateFrontMatter(entity: AnchorProfileEntity): string {
    const data = this.parseFrontmatter(entity.content);
    return this.buildMarkdown("", data as Record<string, unknown>);
  }
}
