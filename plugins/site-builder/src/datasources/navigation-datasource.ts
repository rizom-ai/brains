import type {
  DataSource,
  DataSourceSchema,
  BaseDataSourceContext,
} from "@brains/plugins";
import type { Logger } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { NavigationSlots } from "@brains/site-composition";
import type { RouteRegistry } from "@brains/site-engine";

// Schema for navigation query parameters
const navigationQuerySchema = z.object({
  slot: z.enum(NavigationSlots).optional().default("primary"),
  limit: z.number().optional(),
});

type NavigationQuery = z.output<typeof navigationQuerySchema>;

/**
 * DataSource that provides navigation data from the RouteRegistry
 * Supports querying specific navigation slots
 */
export class NavigationDataSource implements DataSource {
  private readonly routeRegistry: RouteRegistry;
  private readonly logger: Logger;
  public readonly id = "site:navigation";
  public readonly name = "Site Navigation DataSource";
  public readonly description = "Provides navigation items for site menus";

  constructor(routeRegistry: RouteRegistry, logger: Logger) {
    this.routeRegistry = routeRegistry;
    this.logger = logger;
    this.logger.debug("NavigationDataSource initialized");
  }

  /**
   * Fetch navigation data based on query parameters
   * @param query - Query parameters for filtering navigation items
   * @param outputSchema - Schema for validating output format
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    query: unknown,
    outputSchema: DataSourceSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    // Parse and validate query parameters
    const params: NavigationQuery = navigationQuerySchema.parse(query ?? {});

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
