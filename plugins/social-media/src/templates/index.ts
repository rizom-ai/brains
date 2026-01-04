export {
  linkedinTemplate,
  linkedinPostSchema,
  type LinkedInPost,
} from "./linkedin-template";

export {
  SocialPostListTemplate,
  type SocialPostListProps,
} from "./social-post-list";

export {
  SocialPostDetailTemplate,
  type SocialPostDetailProps,
} from "./social-post-detail";

import type { Template } from "@brains/plugins";

/**
 * All social media templates, keyed by name
 */
export const socialMediaTemplates: Record<string, () => Promise<Template>> = {
  linkedin: (): Promise<Template> =>
    import("./linkedin-template").then((m) => m.linkedinTemplate),
};

/**
 * Get template name for a platform
 * @param platform Target platform
 */
export function getTemplateName(platform: "linkedin"): string {
  return `social-media:${platform}`;
}
