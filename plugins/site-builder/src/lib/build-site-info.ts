import type { IAnchorProfileService, IEntityService } from "@brains/plugins";
import { fetchSiteInfo } from "@brains/site-info";
import type { RouteRegistry } from "./route-registry";
import type { SiteInfo } from "../types/site-info";

/**
 * Assemble complete SiteInfo from entity service, profile, and route registry.
 * Used by SiteBuilder at build time.
 */
export async function buildSiteInfo(
  entityService: IEntityService,
  profileService: IAnchorProfileService,
  routeRegistry: RouteRegistry,
): Promise<SiteInfo> {
  let siteInfoBody;
  try {
    siteInfoBody = await fetchSiteInfo(entityService);
  } catch {
    siteInfoBody = {
      title: "Personal Brain",
      description: "A knowledge management system",
    };
  }

  const profileBody = profileService.getProfile();
  const primaryItems = routeRegistry.getNavigationItems("primary");
  const secondaryItems = routeRegistry.getNavigationItems("secondary");

  return {
    ...siteInfoBody,
    socialLinks: profileBody.socialLinks,
    navigation: {
      primary: primaryItems,
      secondary: secondaryItems,
    },
    copyright: siteInfoBody.copyright ?? "Powered by Rizom",
  };
}
