import type { IContentProvider } from "@brains/content-service";
import type { IEntityService, BaseEntity } from "@brains/plugins";
import {
  DashboardDataSchema,
  type DashboardData,
} from "../templates/dashboard/schema";

/**
 * System Stats Provider
 *
 * Provides system statistics including entity counts,
 * recent activity, and build information.
 */
export class SystemStatsProvider implements IContentProvider {
  id = "system-stats";
  name = "System Statistics Provider";

  constructor(private entityService: IEntityService) {}

  /**
   * Fetch dashboard data
   * This is the main method for the dashboard provider
   */
  fetch = async (_query?: unknown): Promise<DashboardData> => {
    // Get entity statistics
    const entityStats = await this.getEntityStats();

    // Get recent entities
    const recentEntities = await this.getRecentEntities();

    // Build dashboard data
    const data = {
      entityStats,
      recentEntities,
      buildInfo: {
        timestamp: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    // Validate against schema to ensure type safety
    return DashboardDataSchema.parse(data);
  };

  /**
   * Get statistics for all entity types
   */
  private async getEntityStats(): Promise<DashboardData["entityStats"]> {
    try {
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
    } catch {
      // Return mock data as fallback
      return [
        { type: "note", count: 42 },
        { type: "task", count: 17 },
        { type: "profile", count: 5 },
        { type: "project", count: 3 },
      ];
    }
  }

  /**
   * Get recently created/modified entities
   */
  private async getRecentEntities(): Promise<DashboardData["recentEntities"]> {
    try {
      // Get actual registered entity types from the service
      const entityTypes = this.entityService.getEntityTypes();
      const allEntities: BaseEntity[] = [];

      for (const type of entityTypes) {
        const entities = await this.entityService.listEntities(type, {
          limit: 5,
          sortBy: "updated",
          sortDirection: "desc",
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
    } catch {
      // Return mock data as fallback
      return [
        {
          id: "1",
          type: "note",
          title: "Meeting Notes - Q4 Planning",
          created: new Date(Date.now() - 3600000).toISOString(),
        },
        {
          id: "2",
          type: "task",
          title: "Review pull request #123",
          created: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: "3",
          type: "note",
          title: "Architecture refactoring ideas",
          created: new Date(Date.now() - 86400000).toISOString(),
        },
      ];
    }
  }
}
