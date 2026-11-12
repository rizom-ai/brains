import type { ServiceDataSourceDeclaration } from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import { NavigationSlots } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

// Schema for navigation query parameters
const navigationQuerySchema = z.object({
  slot: z.enum(NavigationSlots).optional().default("primary"),
  limit: z.number().optional(),
});

type NavigationQuery = z.output<typeof navigationQuerySchema>;

/**
 * The navigation data source, `site:navigation`: the navigation items of
 * one slot of the route registry, which site menus and footers read. The
 * runtime validates the answer against the caller's schema.
 */
export function navigationDataSource(
  routeRegistry: RouteRegistry,
  logger: Logger,
): ServiceDataSourceDeclaration {
  logger.debug("NavigationDataSource initialized");
  return {
    id: "site:navigation",
    name: "Site Navigation DataSource",
    description: "Provides navigation items for site menus",
    fetch: async (query): Promise<unknown> => {
      // Parse and validate query parameters
      const params: NavigationQuery = navigationQuerySchema.parse(query ?? {});

      logger.debug("NavigationDataSource fetch called", { params });

      // Get navigation items for the specified slot
      const items = routeRegistry.getNavigationItems(params.slot);

      // Apply limit if specified
      const limitedItems = params.limit ? items.slice(0, params.limit) : items;

      // Return navigation items array
      const navigationItems = limitedItems.map((item) => ({
        label: item.label,
        href: item.href,
      }));

      logger.debug("NavigationDataSource returning", {
        slot: params.slot,
        itemCount: limitedItems.length,
        items: navigationItems,
      });

      // The output schema will determine the final shape
      // For footer template, it expects { navigation: [...], copyright?: string }
      // We only provide the navigation part
      return { navigation: navigationItems };
    },
  };
}
