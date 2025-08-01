export { HeroLayout } from "./layout";
export { landingHeroDataSchema, type LandingHeroData } from "./schema";
export { HeroSectionFormatter } from "./formatter";

import { landingHeroDataSchema, type LandingHeroData } from "./schema";
import { HeroLayout } from "./layout";
import { HeroSectionFormatter } from "./formatter";
import heroPrompt from "./prompt.txt";
import type { Template } from "@brains/content-generator";

export const heroTemplate: Template<LandingHeroData> = {
  name: "hero",
  description: "Hero section with headline and call-to-action",
  schema: landingHeroDataSchema,
  basePrompt: heroPrompt,
  requiredPermission: "public",
  formatter: new HeroSectionFormatter(),
  layout: {
    component: HeroLayout,
    interactive: false,
  },
};
