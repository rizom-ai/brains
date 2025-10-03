import type { DataSource } from "@brains/datasource";
import type { Logger } from "@brains/plugins";
import { type z as zType } from "@brains/utils";
import type { RouteRegistry } from "../lib/route-registry";

/**
 * DataSource that provides comprehensive site-wide information
 * Combines site configuration with navigation data from RouteRegistry
 */
export class SiteInfoDataSource implements DataSource {
  public readonly id = "site:info";
  public readonly name = "Site Information DataSource";
  public readonly description =
    "Provides comprehensive site-wide information including metadata and navigation";

  constructor(
    private readonly routeRegistry: RouteRegistry,
    private readonly siteConfig: {
      title: string;
      description: string;
      url?: string;
      copyright?: string;
    },
    private readonly logger: Logger,
  ) {
    this.logger.debug("SiteInfoDataSource initialized");
  }

  /**
   * Fetch site information
   * @param query - Optional query parameters (not currently used)
   * @param outputSchema - Schema for validating output format
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: zType.ZodSchema<T>,
  ): Promise<T> {
    this.logger.debug("SiteInfoDataSource fetch called");

    // Get navigation items for both slots
    const primaryItems = this.routeRegistry.getNavigationItems("primary");
    const secondaryItems = this.routeRegistry.getNavigationItems("secondary");

    // Generate default copyright if not provided
    const currentYear = new Date().getFullYear();
    const defaultCopyright = `© ${currentYear} ${this.siteConfig.title}. All rights reserved.`;

    // Build complete site info
    const siteInfo = {
      title: this.siteConfig.title,
      description: this.siteConfig.description,
      ...(this.siteConfig.url && { url: this.siteConfig.url }),
      navigation: {
        primary: primaryItems,
        secondary: secondaryItems,
      },
      copyright: this.siteConfig.copyright ?? defaultCopyright,
    };

    this.logger.debug("SiteInfoDataSource returning", {
      title: siteInfo.title,
      navigationItemCounts: {
        primary: primaryItems.length,
        secondary: secondaryItems.length,
      },
    });

    return outputSchema.parse(siteInfo);
  }
}
