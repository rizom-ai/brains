import type { ContentTemplate } from "@brains/types";
import { landingHeroDataSchema, type LandingHeroData } from "./schema";
import { HeroSectionFormatter } from "./formatter";
import { HeroLayout } from "./layout";
import heroPrompt from "./prompt.txt";

/**
 * Hero section template
 */
export const heroSectionTemplate: ContentTemplate<LandingHeroData> = {
  name: "hero-section",
  description: "Hero section for pages",
  schema: landingHeroDataSchema,
  formatter: new HeroSectionFormatter(),
  basePrompt: heroPrompt,
  layout: {
    component: HeroLayout, // Direct React component reference!
    description: "Hero section with headline and call-to-action",
  },
};

// Export for direct use
export { HeroLayout } from "./layout";
