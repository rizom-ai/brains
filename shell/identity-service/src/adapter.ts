import type { EntityAdapter } from "@brains/entity-service";
import { StructuredContentFormatter, type z } from "@brains/utils";
import {
  identitySchema,
  identityBodySchema,
  type IdentityEntity,
  type IdentityBody,
} from "./schema";

/**
 * Entity adapter for Identity entities
 * Uses structured content formatting - all data in markdown body, no frontmatter
 */
export class IdentityAdapter implements EntityAdapter<IdentityEntity> {
  public readonly entityType = "identity";
  public readonly schema = identitySchema;

  /**
   * Create formatter for identity content
   */
  private createFormatter(): StructuredContentFormatter<IdentityBody> {
    return new StructuredContentFormatter(identityBodySchema, {
      title: "Brain Identity",
      mappings: [
        { key: "role", label: "Role", type: "string" },
        { key: "purpose", label: "Purpose", type: "string" },
        {
          key: "values",
          label: "Values",
          type: "array",
          itemType: "string",
        },
      ],
    });
  }

  /**
   * Create identity content from components
   */
  public createIdentityContent(params: {
    role: string;
    purpose: string;
    values: string[];
  }): string {
    const formatter = this.createFormatter();
    return formatter.format({
      role: params.role,
      purpose: params.purpose,
      values: params.values,
    });
  }

  /**
   * Parse identity body from content
   */
  public parseIdentityBody(content: string): IdentityBody {
    try {
      const formatter = this.createFormatter();
      return formatter.parse(content);
    } catch {
      // Return empty structure if parsing fails
      return {
        role: "",
        purpose: "",
        values: [],
      };
    }
  }

  /**
   * Convert identity entity to markdown with structured content
   */
  public toMarkdown(entity: IdentityEntity): string {
    // Parse existing content to get identity data
    const identityData = this.parseIdentityBody(entity.content);

    const formatter = this.createFormatter();
    return formatter.format(identityData);
  }

  /**
   * Create partial entity from markdown content
   */
  public fromMarkdown(markdown: string): Partial<IdentityEntity> {
    return {
      content: markdown,
      entityType: "identity",
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: IdentityEntity): Record<string, unknown> {
    const identityData = this.parseIdentityBody(entity.content);
    return {
      role: identityData.role,
      values: identityData.values,
    };
  }

  /**
   * Parse frontmatter - not used for identity (returns empty object)
   */
  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    _schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Identity doesn't use frontmatter
    return {} as TFrontmatter;
  }

  /**
   * Generate frontmatter - not used for identity (returns empty string)
   */
  public generateFrontMatter(_entity: IdentityEntity): string {
    // Identity doesn't use frontmatter
    return "";
  }
}
