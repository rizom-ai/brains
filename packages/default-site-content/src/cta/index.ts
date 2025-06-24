export { CTALayout } from "./layout";
export { ctaSectionSchema, type CTASection } from "./schema";
export { CTASectionFormatter } from "./formatter";

import { ctaSectionSchema } from "./schema";
import { CTALayout } from "./layout";
import { CTASectionFormatter } from "./formatter";
import ctaPrompt from "./prompt.txt";

export const ctaTemplate = {
  name: "cta",
  description: "Call to action section",
  schema: ctaSectionSchema,
  component: CTALayout,
  formatter: new CTASectionFormatter(),
  prompt: ctaPrompt,
  interactive: false,
};