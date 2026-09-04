import type { RouteRegistry } from "@brains/site-engine";
import type { SiteLayoutInfo, SiteMetadata } from "@brains/site-composition";
import type { SiteBuildProfileService } from "./site-build-profile-service";

export function buildSiteLayoutInfo(
  siteMetadata: SiteMetadata,
  profileService: SiteBuildProfileService,
  /** Only the navigation items are read; the whole registry is more than this asks. */
  routeRegistry: Pick<RouteRegistry, "getNavigationItems">,
): SiteLayoutInfo {
  const profileBody = profileService.getProfile();
  const primaryItems = routeRegistry.getNavigationItems("primary");
  const secondaryItems = routeRegistry.getNavigationItems("secondary");

  return {
    ...siteMetadata,
    represents: siteMetadata.represents ?? "anchor",
    ...(siteMetadata.represents !== "brain" &&
      profileBody.socialLinks !== undefined && {
        socialLinks: profileBody.socialLinks,
      }),
    navigation: {
      primary: primaryItems,
      secondary: secondaryItems,
    },
    copyright: siteMetadata.copyright ?? "Powered by Rizom",
  };
}
