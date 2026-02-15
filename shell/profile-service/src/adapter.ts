import type { EntityAdapter } from "@brains/entity-service";
import {
  FrontmatterContentHelper,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  profileSchema,
  profileBodySchema,
  type ProfileEntity,
  type ProfileBody,
} from "./schema";

/**
 * Entity adapter for Profile entities
 * Uses frontmatter format for CMS compatibility
 * Supports reading legacy structured content format for backward compatibility
 */
export class ProfileAdapter implements EntityAdapter<ProfileEntity> {
  public readonly entityType = "profile";
  public readonly schema = profileSchema;
  public readonly frontmatterSchema = profileBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = true;

  // TODO: Remove legacy StructuredContentFormatter support once all sites are converted to frontmatter
  private readonly contentHelper = new FrontmatterContentHelper(
    profileBodySchema,
    () =>
      new StructuredContentFormatter(profileBodySchema, {
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
    params: z.input<typeof profileBodySchema>,
  ): string {
    const validatedData = profileBodySchema.parse(params);
    return this.contentHelper.format(validatedData);
  }

  /**
   * Parse profile body from content (handles both frontmatter and legacy formats)
   */
  public parseProfileBody(content: string): ProfileBody {
    return this.contentHelper.parse(content);
  }

  /**
   * Convert profile entity to markdown
   * Content is already stored in frontmatter format — pass through as-is
   */
  public toMarkdown(entity: ProfileEntity): string {
    return entity.content;
  }

  /**
   * Create partial entity from markdown content
   * Preserves frontmatter as-is to avoid stripping extension fields (e.g., tagline, expertise)
   * Only converts legacy structured content format
   */
  public fromMarkdown(markdown: string): Partial<ProfileEntity> {
    return {
      content: markdown.startsWith("---")
        ? markdown
        : this.contentHelper.convertToFrontmatter(markdown),
      entityType: "profile",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: ProfileEntity): Record<string, unknown> {
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
  public generateFrontMatter(entity: ProfileEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.toFrontmatterString(data);
  }
}
