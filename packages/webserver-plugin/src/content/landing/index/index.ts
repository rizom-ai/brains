import type { ContentTemplate } from "@brains/types";
import { landingPageSchema, type LandingPageData } from "./schema";

/**
 * Landing page composite template
 * This is used by Astro to validate the complete landing page YAML
 */
export const landingPageTemplate: ContentTemplate<LandingPageData> = {
  name: "landing-page",
  description: "Complete landing page with all sections",
  schema: landingPageSchema,
  basePrompt: "", // Not used - this is just for schema validation
};
