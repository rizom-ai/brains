import { createTemplate } from "@brains/templates";
import { HeroContentSchema, type HeroContent } from "./schema";
import { HeroLayout } from "./layout";
import { HeroFormatter } from "./formatter";

export { HeroLayout, HeroContentSchema, HeroFormatter, type HeroContent };

export const heroTemplate = createTemplate<HeroContent>({
  name: "hero",
  description: "Rizom site hero — full-viewport intro with CTA row",
  schema: HeroContentSchema,
  formatter: new HeroFormatter(),
  requiredPermission: "public",
  layout: { component: HeroLayout },
});
