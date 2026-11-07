import { SOCIAL_LINK_PLATFORM_LABELS, type SiteLayoutInfo } from "@rizom/site";
import type { RizomLink } from "./types";

export function socialLinksToRizomLinks(
  siteInfo: Pick<SiteLayoutInfo, "socialLinks">,
  allowedPlatforms?: string[],
): RizomLink[] {
  const allowed = allowedPlatforms ? new Set(allowedPlatforms) : undefined;

  return (siteInfo.socialLinks ?? [])
    .filter((link) => (allowed ? allowed.has(link.platform) : true))
    .map((link) => ({
      href: link.url,
      label: link.label ?? SOCIAL_LINK_PLATFORM_LABELS[link.platform],
    }));
}
