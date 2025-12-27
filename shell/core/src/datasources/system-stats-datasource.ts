import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { IEntityService, BaseEntity } from "@brains/entity-service";
import { z } from "@brains/utils";

/**
 * Schema for dashboard data
 */
export const DashboardDataSchema = z.object({
  entityStats: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
    }),
  ),
  recentEntities: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      title: z.string(),
      created: z.string(),
    }),
  ),
  buildInfo: z.object({
    timestamp: z.string(),
    version: z.string(),
  }),
});

export type DashboardData = z.infer<typeof DashboardDataSchema>;

/**
 * System Stats DataSource
 *
 * Provides system statistics including entity counts,
 * recent activity, and build information.
 */
export class SystemStatsDataSource implements DataSource {
  readonly id = "system-stats";
  readonly name = "System Statistics DataSource";
  readonly description =
    "Provides real-time system statistics and entity information";

  constructor(private entityService: IEntityService) {}

  /**
   * Fetch dashboard data
   * This is the main method for the dashboard data source
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    _query: unknown,
    _outputSchema?: z.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    // Get entity statistics
    const entityStats = await this.getEntityStats();

    // Get recent entities
    const recentEntities = await this.getRecentEntities();

    // Build dashboard data
    const data: DashboardData = {
      entityStats,
      recentEntities,
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    // Validate against our schema and return
    return DashboardDataSchema.parse(data) as T;
  }

  /**
   * Get statistics for all entity types
   */
  private async getEntityStats(): Promise<DashboardData["entityStats"]> {
    // Get actual registered entity types from the service
    const entityTypes = this.entityService.getEntityTypes();

    const stats = await Promise.all(
      entityTypes.map(async (type) => {
        // List entities of this type
        const entities = await this.entityService.listEntities(type, {
          limit: 1000, // Just to get count
        });

        return {
          type,
          count: entities.length,
        };
      }),
    );

    return stats;
  }

  /**
   * Get recently created/modified entities
   */
  private async getRecentEntities(): Promise<DashboardData["recentEntities"]> {
    // Get actual registered entity types from the service
    const entityTypes = this.entityService.getEntityTypes();
    const allEntities: BaseEntity[] = [];

    for (const type of entityTypes) {
      const entities = await this.entityService.listEntities(type, {
        limit: 5,
        sortFields: [{ field: "updated", direction: "desc" }],
      });
      allEntities.push(...entities);
    }

    // Sort all entities by updated date and take top 5
    const sorted = allEntities
      .sort(
        (a, b) =>
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime(),
      )
      .slice(0, 5);

    return sorted.map((entity) => ({
      id: entity.id,
      type: entity.entityType,
      title: entity.id, // BaseEntity doesn't have title, use id
      created: entity.created || new Date().toISOString(),
    }));
  }
}
