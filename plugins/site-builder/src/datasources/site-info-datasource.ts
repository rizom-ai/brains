import type { DataSource, BaseDataSourceContext } from "@brains/datasource";
import type { Logger } from "@brains/plugins";
import { type z as zType } from "@brains/utils";
import type { RouteRegistry } from "../lib/route-registry";
import type { SiteInfoService } from "../services/site-info-service";
import type { ProfileService } from "@brains/profile-service";

/**
 * DataSource that provides comprehensive site-wide information
 * Combines site info, profile (socialLinks), and navigation data
 */
export class SiteInfoDataSource implements DataSource {
  public readonly id = "site:info";
  public readonly name = "Site Information DataSource";
  public readonly description =
    "Provides comprehensive site-wide information including metadata, profile, and navigation";

  constructor(
    private readonly routeRegistry: RouteRegistry,
    private readonly siteInfoService: SiteInfoService,
    private readonly profileService: ProfileService,
    private readonly logger: Logger,
  ) {
    this.logger.debug("SiteInfoDataSource initialized");
  }

  /**
   * Fetch site information
   * @param query - Optional query parameters (not currently used)
   * @param outputSchema - Schema for validating output format
   * @param context - Optional context (environment, etc.)
   */
  async fetch<T>(
    _query: unknown,
    outputSchema: zType.ZodSchema<T>,
    _context?: BaseDataSourceContext,
  ): Promise<T> {
    this.logger.debug("SiteInfoDataSource fetch called");

    // Get site info from service (entity or defaults)
    const siteInfoBody = await this.siteInfoService.getSiteInfo();

    // Get profile info from service (for socialLinks)
    const profileBody = await this.profileService.getProfile();

    // Get navigation items for both slots
    const primaryItems = this.routeRegistry.getNavigationItems("primary");
    const secondaryItems = this.routeRegistry.getNavigationItems("secondary");

    // Generate default copyright if not provided
    const currentYear = new Date().getFullYear();
    const defaultCopyright = `© ${currentYear} ${siteInfoBody.title}. All rights reserved.`;

    // Build complete site info (merge site-info, profile.socialLinks, and navigation)
    const siteInfo = {
      ...siteInfoBody,
      // socialLinks now comes from profile entity only
      socialLinks: profileBody.socialLinks,
      navigation: {
        primary: primaryItems,
        secondary: secondaryItems,
      },
      copyright: siteInfoBody.copyright ?? defaultCopyright,
    };

    this.logger.debug("SiteInfoDataSource returning", {
      title: siteInfo.title,
      hasCTA: !!siteInfo.cta,
      hasSocialLinks: !!siteInfo.socialLinks,
      socialLinksCount: siteInfo.socialLinks?.length ?? 0,
      navigationItemCounts: {
        primary: primaryItems.length,
        secondary: secondaryItems.length,
      },
    });

    return outputSchema.parse(siteInfo);
  }
}
