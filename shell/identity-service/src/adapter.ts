import type { EntityAdapter } from "@brains/entity-service";
import {
  FrontmatterContentHelper,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  identitySchema,
  identityBodySchema,
  type IdentityEntity,
  type IdentityBody,
} from "./schema";

/**
 * Entity adapter for Identity entities
 * Uses frontmatter format for CMS compatibility
 * Supports reading legacy structured content format for backward compatibility
 */
export class IdentityAdapter implements EntityAdapter<IdentityEntity> {
  public readonly entityType = "identity";
  public readonly schema = identitySchema;
  public readonly frontmatterSchema = identityBodySchema;
  public readonly isSingleton = true;
  public readonly hasBody = false;

  private readonly contentHelper = new FrontmatterContentHelper(
    identityBodySchema,
    () =>
      new StructuredContentFormatter(identityBodySchema, {
        title: "Brain Identity",
        mappings: [
          { key: "name", label: "Name", type: "string" },
          { key: "role", label: "Role", type: "string" },
          { key: "purpose", label: "Purpose", type: "string" },
          {
            key: "values",
            label: "Values",
            type: "array",
            itemType: "string",
          },
        ],
      }),
  );

  /**
   * Create identity content in frontmatter format
   */
  public createIdentityContent(params: {
    name: string;
    role: string;
    purpose: string;
    values: string[];
  }): string {
    return this.contentHelper.format(params);
  }

  /**
   * Parse identity body from content (handles both frontmatter and legacy formats)
   */
  public parseIdentityBody(content: string): IdentityBody {
    return this.contentHelper.parse(content);
  }

  /**
   * Convert identity entity to frontmatter markdown
   */
  public toMarkdown(entity: IdentityEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.format(data);
  }

  /**
   * Create partial entity from markdown content
   * Auto-converts legacy structured content to frontmatter format
   */
  public fromMarkdown(markdown: string): Partial<IdentityEntity> {
    return {
      content: this.contentHelper.convertToFrontmatter(markdown),
      entityType: "identity",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: IdentityEntity): Record<string, unknown> {
    const data = this.contentHelper.parse(entity.content);
    return {
      role: data.role,
      values: data.values,
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
  public generateFrontMatter(entity: IdentityEntity): string {
    const data = this.contentHelper.parse(entity.content);
    return this.contentHelper.toFrontmatterString(data);
  }
}
