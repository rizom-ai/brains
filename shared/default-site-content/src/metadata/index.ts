export { landingMetadataSchema, type LandingMetadata } from "./schema";

import { landingMetadataSchema } from "./schema";
import metadataPrompt from "./prompt.txt";
import type { Template } from "@brains/plugins";

// Metadata doesn't have a layout component since it's used in HTML head
export const metadataTemplate: Template = {
  name: "metadata",
  description: "Site metadata (title and tagline)",
  schema: landingMetadataSchema,
  basePrompt: metadataPrompt,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  // No layout component since metadata is used in HTML head
};
