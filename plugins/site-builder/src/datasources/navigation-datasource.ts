import type { DataSource } from "@brains/datasource";
import type { Logger } from "@brains/plugins";
import { z, type z as zType } from "@brains/utils";
import type { RouteRegistry } from "../lib/route-registry";
import { NavigationSlots } from "../types/routes";

// Schema for navigation query parameters
const navigationQuerySchema = z.object({
  slot: z.enum(NavigationSlots).optional().default("primary"),
  limit: z.number().optional(),
});

/**
 * DataSource that provides navigation data from the RouteRegistry
 * Supports querying specific navigation slots
 */
export class NavigationDataSource implements DataSource {
  public readonly id = "site:navigation";
  public readonly name = "Site Navigation DataSource";
  public readonly description = "Provides navigation items for site menus";

  constructor(
    private readonly routeRegistry: RouteRegistry,
    private readonly logger: Logger,
  ) {
    this.logger.debug("NavigationDataSource initialized");
  }

  /**
   * Fetch navigation data based on query parameters
   * @param query - Query parameters for filtering navigation items
   * @param outputSchema - Schema for validating output format
   */
  async fetch<T>(query: unknown, outputSchema: zType.ZodSchema<T>): Promise<T> {
    // Parse and validate query parameters
    const params = navigationQuerySchema.parse(query ?? {});

    this.logger.debug("NavigationDataSource fetch called", { params });

    // Get navigation items for the specified slot
    const items = this.routeRegistry.getNavigationItems(params.slot);

    // Apply limit if specified
    const limitedItems = params.limit ? items.slice(0, params.limit) : items;

    // Return navigation items array
    const navigationItems = limitedItems.map((item) => ({
      label: item.label,
      href: item.href,
    }));

    this.logger.debug("NavigationDataSource returning", {
      slot: params.slot,
      itemCount: limitedItems.length,
      items: navigationItems,
    });

    // The output schema will determine the final shape
    // For footer template, it expects { navigation: [...], copyright?: string }
    // We only provide the navigation part
    const result = {
      navigation: navigationItems,
    };

    return outputSchema.parse(result);
  }
}
