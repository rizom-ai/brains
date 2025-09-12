export { IntroLayout } from "./layout";
export { IntroContentSchema, type IntroContent } from "./schema";
export { IntroSectionFormatter } from "./formatter";

import { IntroContentSchema, type IntroContent } from "./schema";
import { IntroLayout } from "./layout";
import { IntroSectionFormatter } from "./formatter";
import { createTemplate } from "@brains/templates";

export const introTemplate = createTemplate<IntroContent>({
  name: "intro",
  description: "Compact introduction section for the brain",
  schema: IntroContentSchema,
  basePrompt: `Generate a welcoming introduction for a Personal Brain application.
Include a tagline, description, and 3 key features with appropriate Lucide icon names.
Focus on the value and capabilities of this knowledge management system.
Valid icon names include: Brain, Search, Shield, Zap, Database, Users, etc.`,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  formatter: new IntroSectionFormatter(),
  layout: {
    component: IntroLayout,
    interactive: false,
  },
});
