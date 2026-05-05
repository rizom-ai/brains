import type { SiteLayoutInfo } from "@brains/site-composition";

export interface SiteBuildProfile {
  socialLinks?: SiteLayoutInfo["socialLinks"] | undefined;
}

export interface SiteBuildProfileService {
  getProfile(): SiteBuildProfile;
}
