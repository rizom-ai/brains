import type { EntityAdapter } from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  profileSchema,
  profileBodySchema,
  type ProfileEntity,
  type ProfileBody,
} from "./schema";

/**
 * Entity adapter for Profile entities
 * Uses structured content formatting - all data in markdown body, no frontmatter
 */
export class ProfileAdapter implements EntityAdapter<ProfileEntity> {
  public readonly entityType = "profile";
  public readonly schema = profileSchema;

  /**
   * Create formatter for profile content
   */
  private createFormatter(): StructuredContentFormatter<ProfileBody> {
    return new StructuredContentFormatter(profileBodySchema, {
      title: "Profile",
      mappings: [
        { key: "name", label: "Name", type: "string" },
        { key: "description", label: "Description", type: "string" },
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "intro", label: "Intro", type: "string" },
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
    });
  }

  /**
   * Create profile content from components
   * Validates input data through Zod schema
   */
  public createProfileContent(
    params: z.input<typeof profileBodySchema>,
  ): string {
    // Validate and normalize through Zod schema
    const validatedData = profileBodySchema.parse(params);
    const formatter = this.createFormatter();
    return formatter.format(validatedData);
  }

  /**
   * Parse profile body from content
   */
  public parseProfileBody(content: string): ProfileBody {
    const formatter = this.createFormatter();
    return formatter.parse(content);
  }

  /**
   * Convert profile entity to markdown with structured content
   */
  public toMarkdown(entity: ProfileEntity): string {
    // Parse existing content to get profile data
    const profileData = this.parseProfileBody(entity.content);

    const formatter = this.createFormatter();
    return formatter.format(profileData);
  }

  /**
   * Create partial entity from markdown content
   */
  public fromMarkdown(markdown: string): Partial<ProfileEntity> {
    return {
      content: markdown,
      entityType: "profile",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: ProfileEntity): Record<string, unknown> {
    const profileData = this.parseProfileBody(entity.content);
    return {
      name: profileData.name,
      email: profileData.email,
      website: profileData.website,
    };
  }

  /**
   * Parse frontmatter - not used for profile (returns empty object)
   */
  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    _schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Profile doesn't use frontmatter
    return {} as TFrontmatter;
  }

  /**
   * Generate frontmatter - not used for profile (returns empty string)
   */
  public generateFrontMatter(_entity: ProfileEntity): string {
    // Profile doesn't use frontmatter
    return "";
  }
}
