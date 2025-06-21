import type { ContentTemplate } from "@brains/types";
import { landingHeroDataSchema, type LandingHeroData } from "./schema";
import { HeroSectionFormatter } from "./formatter";
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
};
