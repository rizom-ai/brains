import type { EntityAdapter } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/entity-service";
import {
  seriesSchema,
  seriesMetadataSchema,
  type Series,
  type SeriesMetadata,
} from "../schemas/series";

/**
 * Adapter for series entities
 * Series are auto-derived from posts but stored with frontmatter for round-trip sync
 */
export class SeriesAdapter implements EntityAdapter<Series, SeriesMetadata> {
  public readonly entityType = "series" as const;
  public readonly schema = seriesSchema;

  /**
   * Convert series entity to markdown with frontmatter
   */
  public toMarkdown(entity: Series): string {
    const frontmatter: Record<string, unknown> = {
      name: entity.metadata.name,
      slug: entity.metadata.slug,
    };
    if (entity.metadata.description) {
      frontmatter["description"] = entity.metadata.description;
    }
    return generateMarkdownWithFrontmatter(entity.content, frontmatter);
  }

  /**
   * Parse markdown to partial series entity
   */
  public fromMarkdown(markdown: string): Partial<Series> {
    const { content, metadata } = parseMarkdownWithFrontmatter(
      markdown,
      seriesMetadataSchema,
    );
    return {
      content,
      entityType: "series",
      metadata,
    };
  }

  /**
   * Extract metadata for search/filtering
   */
  public extractMetadata(entity: Series): SeriesMetadata {
    return entity.metadata;
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
   * Generate frontmatter - not used since toMarkdown handles it directly
   */
  public generateFrontMatter(): string {
    return "";
  }
}

export const seriesAdapter = new SeriesAdapter();
