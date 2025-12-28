import type { EntityAdapter } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  seriesSchema,
  type Series,
  type SeriesMetadata,
} from "../schemas/series";

/**
 * Adapter for series entities
 * Series are auto-derived from posts, so the adapter is minimal
 */
export class SeriesAdapter implements EntityAdapter<Series, SeriesMetadata> {
  public readonly entityType = "series" as const;
  public readonly schema = seriesSchema;

  /**
   * Convert series entity to markdown
   */
  public toMarkdown(entity: Series): string {
    return entity.content;
  }

  /**
   * Parse markdown to partial series entity
   */
  public fromMarkdown(markdown: string): Partial<Series> {
    return {
      content: markdown,
      entityType: "series",
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
    _markdown: string,
    schema: z.ZodSchema<TFrontmatter>,
  ): TFrontmatter {
    // Series entities don't use frontmatter
    return schema.parse({});
  }

  /**
   * Generate frontmatter for series entity
   */
  public generateFrontMatter(): string {
    return "";
  }
}

export const seriesAdapter = new SeriesAdapter();
