import type { SiteLayoutInfo } from "@brains/site-composition";
import type { RizomLink } from "./types";

const DEFAULT_LABELS: Record<string, string> = {
  github: "GitHub",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  email: "Email",
  website: "Website",
};

export function socialLinksToRizomLinks(
  siteInfo: SiteLayoutInfo,
  allowedPlatforms?: string[],
): RizomLink[] {
  const allowed = allowedPlatforms ? new Set(allowedPlatforms) : undefined;

  return (siteInfo.socialLinks ?? [])
    .filter((link) => (allowed ? allowed.has(link.platform) : true))
    .map((link) => ({
      href: link.url,
      label: link.label ?? DEFAULT_LABELS[link.platform] ?? link.platform,
    }));
}
