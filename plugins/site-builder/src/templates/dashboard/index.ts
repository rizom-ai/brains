import { DashboardWidget } from "./layout";
import { DashboardDataSchema, type DashboardData } from "./schema";
import { DashboardFormatter } from "./formatter";
import type { Template, TemplateDataContext } from "@brains/content-generator";
import type { SearchResult } from "@brains/entity-service";

/**
 * Dashboard template definition
 */
export const dashboardTemplate: Template<DashboardData> = {
  name: "dashboard",
  description: "Interactive system dashboard showing entity statistics",
  schema: DashboardDataSchema,
  // No basePrompt - uses getData instead
  requiredPermission: "public",
  formatter: new DashboardFormatter(),
  getData: async ({
    dependencies,
  }: TemplateDataContext): Promise<DashboardData> => {
    try {
      // Get all registered entity types
      const registeredTypes = dependencies.entityService.getEntityTypes();

      // Get entity statistics for registered types
      const entityStats = await Promise.all(
        registeredTypes.map(async (type) => {
          const entities = await dependencies.entityService.listEntities(type, {
            limit: 100,
          });
          return { type, count: entities.length };
        }),
      );

      // Get recent entities
      const recentEntities = await dependencies.entityService.search("", {
        limit: 5,
        sortBy: "created",
        sortDirection: "desc",
      });

      return {
        entityStats,
        recentEntities: recentEntities.map((result: SearchResult) => ({
          id: result.entity.id,
          type: result.entity.entityType,
          title:
            (result.entity.metadata?.["title"] as string) || result.entity.id,
          created: result.entity.created,
        })),
        buildInfo: {
          timestamp: new Date().toISOString(),
          version: "1.0.0", // Could be passed via context.data if needed
        },
      };
    } catch (error) {
      // If we can't get real data, fall back to mock data
      dependencies.logger.info("Using mock dashboard data", error);
      return new DashboardFormatter().getMockData();
    }
  },
  layout: {
    component: DashboardWidget, // Use same component for both SSR and hydration
    interactive: true, // KEY: Marks this component for client-side hydration
  },
};

// Export all dashboard components
export { DashboardWidget } from "./layout";
export { DashboardDataSchema, type DashboardData } from "./schema";
export { DashboardFormatter } from "./formatter";
