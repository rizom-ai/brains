import type { DataSource } from "@brains/datasource";
import type { Logger } from "@brains/plugins";
import type { RouteRegistry } from "../lib/route-registry";

/**
 * DataSource that provides navigation data from the RouteRegistry
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
   * Fetch navigation data
   * Currently returns all main navigation items
   */
  async fetch<T>(_query: unknown): Promise<T> {
    this.logger.debug("NavigationDataSource fetch called");

    // Get all main navigation items
    const items = this.routeRegistry.getNavigationItems("main");

    // Return in the format expected by the footer template
    const result = {
      navigation: items.map((item) => ({
        label: item.label,
        href: item.href,
      })),
      copyright: undefined, // Use default copyright in footer
    };

    this.logger.debug("NavigationDataSource returning", {
      itemCount: items.length,
      items: items.map((i) => ({ label: i.label, href: i.href })),
    });

    return result as T;
  }
}
