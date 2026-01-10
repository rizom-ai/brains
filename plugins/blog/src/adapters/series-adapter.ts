import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  seriesSchema,
  seriesFrontmatterSchema,
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
  public readonly supportsCoverImage = true;

  /**
   * Convert series entity to markdown with frontmatter
   * Preserves coverImageId from existing frontmatter if present
   */
  public toMarkdown(entity: Series): string {
    // Extract body without frontmatter
    let contentBody = entity.content;
    let existingCoverImageId: string | undefined;

    try {
      const parsed = parseMarkdownWithFrontmatter(
        entity.content,
        seriesFrontmatterSchema,
      );
      contentBody = parsed.content;
      existingCoverImageId = parsed.metadata.coverImageId;
    } catch {
      // Content doesn't have valid frontmatter, use as-is
    }

    const frontmatter: Record<string, unknown> = {
      name: entity.metadata.name,
      slug: entity.metadata.slug,
    };
    if (entity.metadata.description) {
      frontmatter["description"] = entity.metadata.description;
    }
    if (existingCoverImageId) {
      frontmatter["coverImageId"] = existingCoverImageId;
    }

    return generateMarkdownWithFrontmatter(contentBody, frontmatter);
  }

  /**
   * Parse markdown to partial series entity
   * Frontmatter includes coverImageId, metadata does not
   * Store full markdown (with frontmatter) in content to preserve coverImageId
   */
  public fromMarkdown(markdown: string): Partial<Series> {
    const { metadata: frontmatter } = parseMarkdownWithFrontmatter(
      markdown,
      seriesFrontmatterSchema,
    );

    // Extract metadata (without coverImageId) from frontmatter
    const metadata: SeriesMetadata = {
      name: frontmatter.name,
      slug: frontmatter.slug,
      description: frontmatter.description,
    };

    return {
      content: markdown, // Store full markdown including frontmatter
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
