export { landingMetadataSchema, type LandingMetadata } from "./schema";

import { landingMetadataSchema, type LandingMetadata } from "./schema";
import metadataPrompt from "./prompt.txt";
import type { Template } from "@brains/plugins";

// Metadata doesn't have a layout component since it's used in HTML head
export const metadataTemplate: Template<LandingMetadata> = {
  name: "metadata",
  description: "Site metadata (title and tagline)",
  schema: landingMetadataSchema,
  basePrompt: metadataPrompt,
  requiredPermission: "public",
  // No layout component since metadata is used in HTML head
};
