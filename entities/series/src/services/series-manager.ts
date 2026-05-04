import type { IEntityService, BaseEntity } from "@brains/entity-service";
import { generateMarkdownWithFrontmatter } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { slugify } from "@brains/utils";
import { computeContentHash } from "@brains/utils/hash";
import type { Series, SeriesFrontmatter } from "../schemas/series";

/**
 * Manages series entities derived from ANY entity type with seriesName metadata.
 * Automatically creates/updates/deletes series based on seriesName values.
 */
export class SeriesManager {
  constructor(
    private readonly entityService: IEntityService,
    private readonly logger: Logger,
  ) {}

  /**
   * Sync all series entities from current entities across all types.
   * Creates new series, preserves existing ones, deletes orphaned ones.
   */
  async syncAllSeries(): Promise<void> {
    this.logger.debug("Syncing series from all entity types");

    const seriesNames = await this.collectSeriesNames();
    this.logger.debug(`Found ${seriesNames.size} unique series`);

    const existingSeries = await this.entityService.listEntities<Series>({
      entityType: "series",
      options: { limit: 1000 },
    });
    const existingMap = new Map(existingSeries.map((s) => [s.id, s]));

    const processedIds = new Set<string>();
    for (const seriesName of seriesNames) {
      const seriesId = slugify(seriesName);
      processedIds.add(seriesId);

      const existing = existingMap.get(seriesId);
      const content = existing?.content ?? this.createSeriesContent(seriesName);
      const contentHash = computeContentHash(content);

      if (existing?.contentHash === contentHash) {
        continue;
      }

      const seriesEntity: Series = {
        id: seriesId,
        entityType: "series",
        content,
        contentHash,
        created: existing?.created ?? new Date().toISOString(),
        updated: new Date().toISOString(),
        metadata: { title: seriesName, slug: slugify(seriesName) },
      };

      await this.entityService.upsertEntity(seriesEntity);
      this.logger.debug(`Upserted series: ${seriesName}`);
    }

    // Delete orphaned series
    for (const existing of existingSeries) {
      if (!processedIds.has(existing.id)) {
        await this.entityService.deleteEntity({
          entityType: "series",
          id: existing.id,
        });
        this.logger.debug(`Deleted orphaned series: ${existing.id}`);
      }
    }
  }

  /**
   * Handle an entity change — ensure its series exists, clean up old if moved.
   */
  async handleEntityChange(
    entity: BaseEntity,
    oldSeriesName?: string,
  ): Promise<void> {
    const seriesName = this.getSeriesName(entity);

    if (seriesName) {
      await this.ensureSeriesExists(seriesName);
    }

    if (oldSeriesName && oldSeriesName !== seriesName) {
      await this.cleanupOrphanedSeries(oldSeriesName);
    }
  }

  /**
   * Handle entity deletion — resync all series to clean up orphans.
   */
  async handleEntityDeleted(): Promise<void> {
    await this.syncAllSeries();
  }

  /**
   * Extract seriesName from any entity's metadata.
   */
  getSeriesName(entity: BaseEntity): string | undefined {
    const metadata = entity.metadata as Record<string, unknown>;
    const name = metadata["seriesName"];
    return typeof name === "string" ? name : undefined;
  }

  private async ensureSeriesExists(seriesName: string): Promise<void> {
    const seriesId = slugify(seriesName);
    const existing = await this.entityService.getEntity<Series>({
      entityType: "series",
      id: seriesId,
    });

    if (existing) {
      return;
    }

    const content = this.createSeriesContent(seriesName);
    const seriesEntity: Series = {
      id: seriesId,
      entityType: "series",
      content,
      contentHash: computeContentHash(content),
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      metadata: { title: seriesName, slug: slugify(seriesName) },
    };

    await this.entityService.upsertEntity(seriesEntity);
    this.logger.debug(`Created series: ${seriesName}`);
  }

  async cleanupOrphanedSeries(seriesName: string): Promise<void> {
    const seriesId = slugify(seriesName);
    const series = await this.entityService.getEntity<Series>({
      entityType: "series",
      id: seriesId,
    });
    if (!series) return;

    // Check all entity types for references to this series
    const hasReferences = await this.hasSeriesReferences(seriesName);
    if (!hasReferences) {
      await this.entityService.deleteEntity({
        entityType: "series",
        id: seriesId,
      });
      this.logger.debug(`Deleted orphaned series: ${seriesName}`);
    }
  }

  private async hasSeriesReferences(seriesName: string): Promise<boolean> {
    const types = this.entityService.getEntityTypes();
    for (const type of types) {
      if (type === "series") continue;
      const entities = await this.entityService.listEntities({
        entityType: type,
        options: {
          filter: { metadata: { seriesName } },
          limit: 1,
        },
      });
      if (entities.length > 0) return true;
    }
    return false;
  }

  private async collectSeriesNames(): Promise<Set<string>> {
    const names = new Set<string>();
    const types = this.entityService.getEntityTypes();

    for (const type of types) {
      if (type === "series") continue;
      const entities = await this.entityService.listEntities({
        entityType: type,
        options: {
          limit: 1000,
        },
      });
      for (const entity of entities) {
        const name = this.getSeriesName(entity);
        if (name) names.add(name);
      }
    }

    return names;
  }

  private createSeriesContent(seriesName: string): string {
    const frontmatter: SeriesFrontmatter = {
      title: seriesName,
      slug: slugify(seriesName),
    };
    return generateMarkdownWithFrontmatter("", frontmatter);
  }
}
