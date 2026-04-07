import { createTemplate } from "@brains/templates";
import { HeroContentSchema, type HeroContent } from "./schema";
import { HeroLayout } from "./layout";

export { HeroLayout, HeroContentSchema, type HeroContent };

export const heroTemplate = createTemplate<HeroContent>({
  name: "hero",
  description: "Rizom site hero — full-viewport intro with CTA row",
  schema: HeroContentSchema,
  requiredPermission: "public",
  layout: {
    component: HeroLayout,
  },
});
