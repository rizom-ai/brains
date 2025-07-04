import type { Logger, SiteContentEntityType, SiteContent } from "@brains/types";
import type { IEntityService as EntityService } from "@brains/entity-service";

/**
 * Service for querying and retrieving content entities
 * Provides high-level query operations for content management
 */
export class EntityQueryService {
  private static instance: EntityQueryService | null = null;

  // Singleton access
  public static getInstance(
    entityService: EntityService,
    logger: Logger,
  ): EntityQueryService {
    EntityQueryService.instance ??= new EntityQueryService(
      entityService,
      logger,
    );
    return EntityQueryService.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    EntityQueryService.instance = null;
  }

  // Isolated instance creation
  public static createFresh(
    entityService: EntityService,
    logger: Logger,
  ): EntityQueryService {
    return new EntityQueryService(entityService, logger);
  }

  // Private constructor to enforce factory methods
  private constructor(
    private readonly entityService: EntityService,
    private readonly logger: Logger,
  ) {}

  /**
   * Get a specific content entity by ID
   */
  async getContent(
    entityType: SiteContentEntityType,
    entityId: string,
  ): Promise<SiteContent | null> {
    this.logger.debug("Getting content entity", { entityType, entityId });

    try {
      const entity = await this.entityService.getEntity(entityType, entityId);
      return entity as SiteContent | null;
    } catch (error) {
      this.logger.error("Failed to get content entity", {
        entityType,
        entityId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Get all content entities for a specific page
   */
  async getPageContent(
    entityType: SiteContentEntityType,
    pageId: string,
  ): Promise<SiteContent[]> {
    this.logger.debug("Getting page content", { entityType, pageId });

    try {
      const entities = await this.entityService.listEntities<SiteContent>(
        entityType,
        {
          filter: { metadata: { pageId } },
        },
      );
      return entities;
    } catch (error) {
      this.logger.error("Failed to get page content", {
        entityType,
        pageId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get a specific section content
   */
  async getSectionContent(
    entityType: SiteContentEntityType,
    pageId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ) => string,
  ): Promise<SiteContent | null> {
    const entityId = generateId(entityType, pageId, sectionId);
    return this.getContent(entityType, entityId);
  }

  /**
   * Get all content entities of a specific type
   */
  async getAllContent(
    entityType: SiteContentEntityType,
  ): Promise<SiteContent[]> {
    this.logger.debug("Getting all content", { entityType });

    try {
      const entities = await this.entityService.listEntities<SiteContent>(
        entityType,
        {},
      );
      return entities;
    } catch (error) {
      this.logger.error("Failed to get all content", {
        entityType,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if content exists for a specific page/section
   */
  async contentExists(
    entityType: SiteContentEntityType,
    pageId: string,
    sectionId: string,
    generateId: (
      type: SiteContentEntityType,
      pageId: string,
      sectionId: string,
    ) => string,
  ): Promise<boolean> {
    const content = await this.getSectionContent(
      entityType,
      pageId,
      sectionId,
      generateId,
    );
    return content !== null;
  }

  /**
   * Get content entities that match specific criteria
   */
  async queryContent(
    entityType: SiteContentEntityType,
    criteria: Record<string, unknown>,
  ): Promise<SiteContent[]> {
    this.logger.debug("Querying content with criteria", {
      entityType,
      criteria,
    });

    try {
      const entities = await this.entityService.listEntities<SiteContent>(
        entityType,
        {
          filter: { metadata: criteria },
        },
      );
      return entities;
    } catch (error) {
      this.logger.error("Failed to query content", {
        entityType,
        criteria,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Get content statistics for multiple entity types on a page
   */
  async getPageStats(
    pageId: string,
    entityTypes: SiteContentEntityType[],
  ): Promise<Record<SiteContentEntityType, number> & { total: number }> {
    this.logger.debug("Getting page stats", { pageId, entityTypes });

    try {
      const results = await Promise.all(
        entityTypes.map(async (entityType) => {
          const content = await this.getPageContent(entityType, pageId);
          return { entityType, count: content.length };
        }),
      );

      const stats = results.reduce(
        (acc, { entityType, count }) => {
          acc[entityType] = count;
          acc.total += count;
          return acc;
        },
        { total: 0 } as Record<SiteContentEntityType, number> & {
          total: number;
        },
      );

      return stats;
    } catch (error) {
      this.logger.error("Failed to get page stats", {
        pageId,
        entityTypes,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty stats for all requested entity types
      const emptyStats = entityTypes.reduce(
        (acc, entityType) => {
          acc[entityType] = 0;
          return acc;
        },
        { total: 0 } as Record<SiteContentEntityType, number> & {
          total: number;
        },
      );

      return emptyStats;
    }
  }
}
