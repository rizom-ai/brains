export {
  linkedinGenerationTemplate,
  linkedinPostGenerationSchema,
  type LinkedInPostGeneration,
} from "./linkedin-generation-template";

export {
  linkedinFromSourceTemplate,
  linkedinFromSourceSchema,
  type LinkedInFromSource,
} from "./linkedin-from-source-template";

import type { Template } from "@brains/plugins";

/**
 * All social media templates, keyed by name
 */
export const socialMediaTemplates: Record<string, () => Promise<Template>> = {
  "generation-linkedin": (): Promise<Template> =>
    import("./linkedin-generation-template").then(
      (m) => m.linkedinGenerationTemplate,
    ),
  "from-source-linkedin": (): Promise<Template> =>
    import("./linkedin-from-source-template").then(
      (m) => m.linkedinFromSourceTemplate,
    ),
};

/**
 * Get template name for a platform
 * @param baseTemplate Base template name (e.g., "generation", "from-source")
 * @param platform Target platform
 */
export function getTemplateName(
  baseTemplate: "generation" | "from-source",
  platform: "linkedin",
): string {
  return `social-media:${baseTemplate}-${platform}`;
}
