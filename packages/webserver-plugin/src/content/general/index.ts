import type { ContentTemplate } from "@brains/types";
import { generalContextSchema, type GeneralContext } from "./schema";

export const generalContextTemplate: ContentTemplate<GeneralContext> = {
  name: "general-context",
  description: "General organizational context that informs all content generation",
  schema: generalContextSchema,
  basePrompt: `You are creating the foundational context for an organization's website.
  
Analyze the available content and generate:
- Organization name and identity
- Clear mission and vision statements
- 3-5 core values with descriptions
- Appropriate brand tone
- Key themes (3-6)
- Target audience definition
- Main focus areas (3-6)

This context will be used to ensure consistency across all generated content.
Make it authentic and aligned with the organization's actual work.`,
};

export { generalContextSchema } from "./schema";
export type { GeneralContext } from "./schema";