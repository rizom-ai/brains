import type { RouteRegistry } from "@brains/site-engine";
import type { SiteLayoutInfo, SiteMetadata } from "@brains/site-composition";
import type { SiteBuildProfileService } from "./site-build-profile-service";

/**
 * Assemble complete site layout info from resolved metadata, profile, and route registry.
 * Used by SiteBuilder at build time.
 */
export function buildSiteLayoutInfo(
  siteMetadata: SiteMetadata,
  profileService: SiteBuildProfileService,
  routeRegistry: RouteRegistry,
): SiteLayoutInfo {
  const profileBody = profileService.getProfile();
  const primaryItems = routeRegistry.getNavigationItems("primary");
  const secondaryItems = routeRegistry.getNavigationItems("secondary");

  return {
    ...siteMetadata,
    ...(profileBody.socialLinks !== undefined && {
      socialLinks: profileBody.socialLinks,
    }),
    navigation: {
      primary: primaryItems,
      secondary: secondaryItems,
    },
    copyright: siteMetadata.copyright ?? "Powered by Rizom",
  };
}
