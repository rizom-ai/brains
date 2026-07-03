import {
  BaseEntityAdapter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { z } from "@brains/utils/zod-v4";
import {
  anchorProfileSchema,
  anchorProfileBodySchema,
  type AnchorProfileEntity,
  type AnchorProfile,
} from "./anchor-profile-schema";

const frontmatterRecordSchema = z.record(z.string(), z.unknown());

interface ProfileBodyParser<T> {
  parse(data: unknown): T;
}

/**
 * Entity adapter for Anchor Profile entities
 * Uses frontmatter format for CMS compatibility
 */
export class AnchorProfileAdapter extends BaseEntityAdapter<
  AnchorProfileEntity,
  Record<string, unknown>,
  AnchorProfile
> {
  constructor() {
    super({
      entityType: "anchor-profile",
      purpose: "The profile of the brain's anchor owner (singleton).",
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
  public createProfileContent(params: AnchorProfile): string {
    const validatedData = anchorProfileBodySchema.parse(params);
    return this.buildMarkdown("", validatedData);
  }

  /**
   * Parse profile body from content.
   * When called with an extended schema, parses against that schema
   * and maps the markdown body to the `story` field.
   */
  public parseProfileBody(content: string): AnchorProfile;
  public parseProfileBody<T extends Record<string, unknown>>(
    content: string,
    schema: ProfileBodyParser<T>,
  ): T;
  public parseProfileBody<T extends Record<string, unknown>>(
    content: string,
    schema?: ProfileBodyParser<T>,
  ): AnchorProfile | T {
    if (schema) {
      const { metadata: parsed, content: body } = parseMarkdownWithFrontmatter(
        content,
        schema,
      );
      return body ? { ...parsed, story: body } : parsed;
    }
    return this.parseFrontmatter(content);
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
    const data = this.parseFrontmatter(entity.content);
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
    return this.buildMarkdown("", frontmatterRecordSchema.parse(data));
  }
}
