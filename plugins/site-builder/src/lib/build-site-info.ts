import type { ProfileService } from "@brains/plugins";
import type { RouteRegistry } from "./route-registry";
import type { SiteInfoService } from "../services/site-info-service";
import type { SiteInfo } from "../types/site-info";

/**
 * Assemble complete SiteInfo from services and route registry.
 * Shared by SiteBuilder and SiteInfoDataSource.
 */
export async function buildSiteInfo(
  siteInfoService: SiteInfoService,
  profileService: ProfileService,
  routeRegistry: RouteRegistry,
): Promise<SiteInfo> {
  const siteInfoBody = await siteInfoService.getSiteInfo();
  const profileBody = profileService.getProfile();

  const primaryItems = routeRegistry.getNavigationItems("primary");
  const secondaryItems = routeRegistry.getNavigationItems("secondary");

  const currentYear = new Date().getFullYear();
  const defaultCopyright = `© ${currentYear} ${siteInfoBody.title}. All rights reserved.`;

  return {
    ...siteInfoBody,
    socialLinks: profileBody.socialLinks,
    navigation: {
      primary: primaryItems,
      secondary: secondaryItems,
    },
    copyright: siteInfoBody.copyright ?? defaultCopyright,
  };
}
