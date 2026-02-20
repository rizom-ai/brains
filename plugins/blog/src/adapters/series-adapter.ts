import { BaseEntityAdapter } from "@brains/plugins";
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
export class SeriesAdapter extends BaseEntityAdapter<Series, SeriesMetadata> {
  constructor() {
    super({
      entityType: "series",
      schema: seriesSchema,
      frontmatterSchema: seriesFrontmatterSchema,
      supportsCoverImage: true,
    });
  }

  /**
   * Convert series entity to markdown with frontmatter
   * Preserves coverImageId from existing frontmatter if present
   */
  public toMarkdown(entity: Series): string {
    let existingCoverImageId: string | undefined;
    let existingBody: SeriesBody = {};

    try {
      const parsed = this.parseFrontMatter(
        entity.content,
        seriesFrontmatterSchema,
      );
      existingCoverImageId = parsed.coverImageId;
      const formatter = createSeriesBodyFormatter(entity.metadata.title);
      existingBody = formatter.parse(this.extractBody(entity.content));
    } catch {
      // Content doesn't have valid frontmatter/body, use defaults
    }

    const frontmatter: SeriesFrontmatter = {
      title: entity.metadata.title,
      slug: entity.metadata.slug,
      ...(existingCoverImageId && { coverImageId: existingCoverImageId }),
    };

    const formatter = createSeriesBodyFormatter(entity.metadata.title);
    const contentBody = formatter.format(existingBody);

    return this.buildMarkdown(contentBody, frontmatter);
  }

  public fromMarkdown(markdown: string): Partial<Series> {
    const frontmatter = this.parseFrontMatter(
      markdown,
      seriesFrontmatterSchema,
    );

    return {
      content: markdown,
      entityType: "series",
      metadata: {
        title: frontmatter.title,
        slug: frontmatter.slug,
      },
    };
  }

  /** Parse series body from content */
  public parseBody(markdown: string): SeriesBody {
    try {
      const metadata = this.parseFrontMatter(markdown, seriesFrontmatterSchema);
      const formatter = createSeriesBodyFormatter(metadata.title);
      return formatter.parse(this.extractBody(markdown));
    } catch {
      return {};
    }
  }

  /** Generate frontmatter - not used since toMarkdown handles it directly */
  public override generateFrontMatter(): string {
    return "";
  }
}

export const seriesAdapter = new SeriesAdapter();
