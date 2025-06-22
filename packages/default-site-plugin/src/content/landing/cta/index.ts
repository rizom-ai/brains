import type { ContentTemplate } from "@brains/types";
import { ctaSectionSchema, type CTASection } from "./schema";
import { CTASectionFormatter } from "./formatter";
import { CTALayout } from "./layout";
import ctaPrompt from "./prompt.txt";

/**
 * CTA section template
 */
export const ctaSectionTemplate: ContentTemplate<CTASection> = {
  name: "cta-section",
  description: "Call-to-action section for pages",
  schema: ctaSectionSchema,
  formatter: new CTASectionFormatter(),
  basePrompt: ctaPrompt,
  layout: {
    component: CTALayout,
    description: "Call-to-action section",
  },
};

// Export for direct use
export { CTALayout } from "./layout";
