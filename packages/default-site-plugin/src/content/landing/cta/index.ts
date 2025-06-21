import type { ContentTemplate } from "@brains/types";
import { ctaSectionSchema, type CTASection } from "./schema";
import { CTASectionFormatter } from "./formatter";
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
};
