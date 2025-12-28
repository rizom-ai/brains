import type { IEntityService, Logger } from "@brains/plugins";
import { slugify, computeContentHash } from "@brains/utils";
import type { BlogPost } from "../schemas/blog-post";
import type { Series } from "../schemas/series";

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
   */
  async syncSeriesFromPosts(): Promise<void> {
    this.logger.debug("Syncing series from posts");

    // Get all posts
    const posts = await this.entityService.listEntities<BlogPost>("post", {});

    // Aggregate posts by series name
    const seriesMap = new Map<string, { name: string; postCount: number }>();
    for (const post of posts) {
      const seriesName = post.metadata.seriesName;
      if (seriesName) {
        const existing = seriesMap.get(seriesName);
        if (existing) {
          existing.postCount++;
        } else {
          seriesMap.set(seriesName, { name: seriesName, postCount: 1 });
        }
      }
    }

    this.logger.debug(`Found ${seriesMap.size} unique series in posts`);

    // Get existing series entities
    const existingSeries = await this.entityService.listEntities<Series>(
      "series",
      {},
    );

    // Create/update series entities
    const processedIds = new Set<string>();
    for (const [, seriesInfo] of seriesMap) {
      const seriesId = `series-${slugify(seriesInfo.name)}`;
      processedIds.add(seriesId);

      const content = `# ${seriesInfo.name}\n\nA series of ${seriesInfo.postCount} posts.`;

      const seriesEntity: Series = {
        id: seriesId,
        entityType: "series",
        content,
        contentHash: computeContentHash(content),
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: {
          name: seriesInfo.name,
          slug: slugify(seriesInfo.name),
          postCount: seriesInfo.postCount,
        },
      };

      await this.entityService.upsertEntity(seriesEntity);
      this.logger.debug(`Upserted series: ${seriesInfo.name}`);
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
   * Handle a post change (create/update/delete)
   * Only triggers sync if the post has a seriesName
   */
  async handlePostChange(post: BlogPost): Promise<void> {
    if (!post.metadata.seriesName) {
      return;
    }

    // Full sync to ensure counts are accurate
    await this.syncSeriesFromPosts();
  }
}
