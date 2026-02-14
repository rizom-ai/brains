import type { EntityAdapter } from "@brains/plugins";
import {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  seriesSchema,
  seriesFrontmatterSchema,
  createSeriesBodyFormatter,
  type Series,
  type SeriesMetadata,
  type SeriesFrontmatter,
  type SeriesBody,
} from "../schemas/series";

/**
 * Adapter for series entities
 * Series are auto-derived from posts but stored with frontmatter for round-trip sync
 * Description is stored in structured content body, not frontmatter
 */
export class SeriesAdapter implements EntityAdapter<Series, SeriesMetadata> {
  public readonly entityType = "series" as const;
  public readonly schema = seriesSchema;
  public readonly supportsCoverImage = true;
  public readonly frontmatterSchema = seriesFrontmatterSchema;

  /**
   * Convert series entity to markdown with frontmatter
   * Preserves coverImageId from existing frontmatter if present
   */
  public toMarkdown(entity: Series): string {
    // Extract existing frontmatter data
    let existingCoverImageId: string | undefined;
    let existingBody: SeriesBody = {};

    try {
      const parsed = parseMarkdownWithFrontmatter(
        entity.content,
        seriesFrontmatterSchema,
      );
      existingCoverImageId = parsed.metadata.coverImageId;
      // Parse structured content from body
      const formatter = createSeriesBodyFormatter(entity.metadata.title);
      existingBody = formatter.parse(parsed.content);
    } catch {
      // Content doesn't have valid frontmatter/body, use defaults
    }

    const frontmatter: SeriesFrontmatter = {
      title: entity.metadata.title,
      slug: entity.metadata.slug,
      ...(existingCoverImageId && { coverImageId: existingCoverImageId }),
    };

    // Generate structured content body
    const formatter = createSeriesBodyFormatter(entity.metadata.title);
    const contentBody = formatter.format(existingBody);

    return generateMarkdownWithFrontmatter(contentBody, frontmatter);
  }

  /**
   * Parse series body from content
   */
  public parseBody(markdown: string): SeriesBody {
    try {
      const { content, metadata } = parseMarkdownWithFrontmatter(
        markdown,
        seriesFrontmatterSchema,
      );
      const formatter = createSeriesBodyFormatter(metadata.title);
      return formatter.parse(content);
    } catch {
      return {};
    }
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

    // Metadata only has fields needed for DB queries (not description/coverImageId)
    const metadata: SeriesMetadata = {
      title: frontmatter.title,
      slug: frontmatter.slug,
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
