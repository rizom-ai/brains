import type { SiteLayoutInfo } from "@brains/site-composition";

export interface SiteBuildProfile {
  socialLinks?: SiteLayoutInfo["socialLinks"] | undefined;
  photo?: string | undefined;
}

export interface SiteBuildProfileService {
  getProfile(): SiteBuildProfile;
}
