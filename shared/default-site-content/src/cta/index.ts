export { CTALayout } from "./layout";
export { ctaSectionSchema, type CTASection } from "./schema";
export { CTASectionFormatter } from "./formatter";

import { ctaSectionSchema, type CTASection } from "./schema";
import { CTALayout } from "./layout";
import { CTASectionFormatter } from "./formatter";
import ctaPrompt from "./prompt.txt";
import type { ContentTemplate } from "@brains/plugins";

export const ctaTemplate: ContentTemplate<CTASection> = {
  name: "cta",
  description: "Call to action section",
  schema: ctaSectionSchema,
  basePrompt: ctaPrompt,
  requiredPermission: "public",
  formatter: new CTASectionFormatter(),
  layout: {
    component: CTALayout,
    interactive: false,
  },
};
