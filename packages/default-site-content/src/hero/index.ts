export { HeroLayout } from "./layout";
export { landingHeroDataSchema, type LandingHeroData } from "./schema";
export { HeroSectionFormatter } from "./formatter";

import { landingHeroDataSchema } from "./schema";
import { HeroLayout } from "./layout";
import { HeroSectionFormatter } from "./formatter";
import heroPrompt from "./prompt.txt";

export const heroTemplate = {
  name: "hero",
  description: "Hero section with headline and call-to-action",
  schema: landingHeroDataSchema,
  component: HeroLayout,
  formatter: new HeroSectionFormatter(),
  prompt: heroPrompt,
  interactive: false,
};