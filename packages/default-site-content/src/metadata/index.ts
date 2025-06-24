export { landingMetadataSchema, type LandingMetadata } from "./schema";

import { landingMetadataSchema } from "./schema";
import metadataPrompt from "./prompt.txt";

// Metadata doesn't have a layout component since it's used in HTML head
export const metadataTemplate = {
  name: "metadata",
  description: "Site metadata (title and tagline)",
  schema: landingMetadataSchema,
  component: null, // No visual component
  formatter: null, // Using default formatter
  prompt: metadataPrompt,
  interactive: false,
};