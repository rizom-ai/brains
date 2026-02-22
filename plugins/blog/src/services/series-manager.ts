import type { IEntityService } from "@brains/plugins";
import { generateMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { slugify, computeContentHash } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import type { Series } from "../schemas/series";
import type { SeriesFrontmatter } from "../schemas/series";

/**
 * Manages series entities derived from blog posts
 * Automatically creates/updates/deletes series based on post seriesName values
 */
export class SeriesManager {
  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {}

  /**
   * Sync all series entities from current posts
   * Creates new series, updates existing ones, deletes orphaned ones
   * Note: postCount is computed dynamically when fetching, not stored
   */
  async syncSeriesFromPosts(): Promise<void> {
    this.logger.debug("Syncing series from posts");

    // Get all posts
    const posts = await this.entityService.listEntities<BlogPost>("post", {});

    // Collect unique series names from posts
    const seriesNames = new Set<string>();
    for (const post of posts) {
      const seriesName = post.metadata.seriesName;
      if (seriesName) {
        seriesNames.add(seriesName);
      }
    }

    this.logger.debug(`Found ${seriesNames.size} unique series in posts`);

    // Get existing series entities (indexed by ID for quick lookup)
    const existingSeries = await this.entityService.listEntities<Series>(
      "series",
      {},
    );
    const existingSeriesMap = new Map<string, Series>();
    for (const series of existingSeries) {
      existingSeriesMap.set(series.id, series);
    }

    // Create series entities only if they don't already exist
    const processedIds = new Set<string>();
    for (const seriesName of seriesNames) {
      const seriesId = slugify(seriesName);
      processedIds.add(seriesId);

      // Check if series already exists
      const existing = existingSeriesMap.get(seriesId);

      // Preserve existing content (which may have frontmatter with coverImageId, description, etc.)
      // Only create new minimal content for truly new series
      const content = existing?.content ?? this.createSeriesContent(seriesName);
      const contentHash = computeContentHash(content);

      // Skip if series exists and content hasn't changed
      if (existing && existing.contentHash === contentHash) {
        this.logger.debug(`Series already exists unchanged: ${seriesName}`);
        continue;
      }

      const seriesEntity: Series = {
        id: seriesId,
        entityType: "series",
        content,
        contentHash,
        created: existing?.created ?? new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          title: seriesName,
          slug: slugify(seriesName),
        },
      };

      await this.entityService.upsertEntity(seriesEntity);
      this.logger.debug(`Upserted series: ${seriesName}`);
    }

    // Delete orphaned series (series with no posts)
    for (const existing of existingSeries) {
      if (!processedIds.has(existing.id)) {
        await this.entityService.deleteEntity("series", existing.id);
        this.logger.debug(`Deleted orphaned series: ${existing.id}`);
      }
    }

    this.logger.debug("Series sync complete");
  }

  /**
   * Handle a post change - ensure the new series exists and cleanup old if changed
   * @param post The post that changed
   * @param oldSeriesName Optional previous series name (if post moved between series)
   */
  async handlePostChange(
    post: BlogPost,
    oldSeriesName?: string,
  ): Promise<void> {
    const seriesName = post.metadata.seriesName;

    // Ensure new series exists
    if (seriesName) {
      await this.ensureSeriesExists(seriesName);
    }

    // Cleanup old series if post moved to a different series
    if (oldSeriesName && oldSeriesName !== seriesName) {
      await this.cleanupOrphanedSeries(oldSeriesName);
    }
  }

  /**
   * Check if a series has no posts and delete it if orphaned
   */
  async cleanupOrphanedSeries(seriesName: string): Promise<void> {
    const seriesId = slugify(seriesName);

    // Check if series exists
    const series = await this.entityService.getEntity<Series>(
      "series",
      seriesId,
    );
    if (!series) {
      return;
    }

    // Check if any posts still reference this series
    const posts = await this.entityService.listEntities<BlogPost>("post", {
      filter: { metadata: { seriesName } },
      limit: 1,
    });

    if (posts.length === 0) {
      await this.entityService.deleteEntity("series", seriesId);
      this.logger.debug(`Deleted orphaned series: ${seriesName}`);
    }
  }

  /**
   * Ensure a series entity exists for the given series name
   * Creates it if it doesn't exist, does nothing if it does
   */
  async ensureSeriesExists(seriesName: string): Promise<void> {
    const seriesId = slugify(seriesName);

    // Check if series already exists
    const existing = await this.entityService.getEntity<Series>(
      "series",
      seriesId,
    );

    if (existing) {
      this.logger.debug(`Series already exists: ${seriesName}`);
      return;
    }

    // Create new series
    const content = this.createSeriesContent(seriesName);
    const seriesEntity: Series = {
      id: seriesId,
      entityType: "series",
      content,
      contentHash: computeContentHash(content),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata: {
        title: seriesName,
        slug: slugify(seriesName),
      },
    };

    await this.entityService.upsertEntity(seriesEntity);
    this.logger.debug(`Created series: ${seriesName}`);
  }

  /**
   * Create initial markdown content for a new series
   */
  private createSeriesContent(seriesName: string): string {
    const slug = slugify(seriesName);
    const frontmatter: SeriesFrontmatter = {
      title: seriesName,
      slug,
    };
    return generateMarkdownWithFrontmatter("", frontmatter);
  }
}
