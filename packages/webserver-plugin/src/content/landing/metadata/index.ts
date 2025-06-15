import type { ContentTemplate } from "@brains/types";
import { landingMetadataSchema } from "./schema";

// TODO: Consider refactoring this to be site-wide metadata (site:metadata)
// rather than landing-page specific, since title and tagline are used
// across the entire site, not just the landing page
export const landingMetadataTemplate: ContentTemplate<unknown> = {
  name: "landing-metadata",
  description: "Metadata for landing page (title and tagline)",
  schema: landingMetadataSchema,
  basePrompt: `Generate metadata for a landing page. Include:
- A compelling title that captures the essence of the site
- A tagline that summarizes the value proposition

Keep it concise and impactful.`,
};

export { landingMetadataSchema } from "./schema";
export type { LandingMetadata } from "./schema";
