import { createTemplate } from "@brains/templates";
import { HeroContentSchema, type HeroContent } from "./schema";
import { HeroLayout } from "./layout";
import { heroFormatter } from "./formatter";

export const heroTemplate = createTemplate<HeroContent>({
  name: "hero",
  description: "Rizom site hero — full-viewport intro with CTA row",
  schema: HeroContentSchema,
  formatter: heroFormatter,
  requiredPermission: "public",
  layout: { component: HeroLayout },
});
