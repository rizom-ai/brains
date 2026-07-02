export { CTALayout } from "./layout";
export { ctaSectionSchema, type CTASection } from "./schema";
export { CTASectionFormatter } from "./formatter";

import { ctaSectionSchema, type CTASection } from "./schema";
import { CTALayout } from "./layout";
import { CTASectionFormatter } from "./formatter";
import ctaPrompt from "./prompt.txt";
import { createTemplate, type Template } from "@brains/templates";

export const ctaTemplate: Template = createTemplate<CTASection>({
  name: "cta",
  description: "Call to action section",
  schema: ctaSectionSchema,
  basePrompt: ctaPrompt,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  formatter: new CTASectionFormatter(),
  layout: {
    component: CTALayout,
  },
});
