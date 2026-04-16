import { createTemplate } from "@brains/templates";
import {
  FoundationHeroContentSchema,
  type FoundationHeroContent,
} from "./schema";
import { FoundationHeroLayout } from "./layout";
import { foundationHeroFormatter } from "./formatter";

export const foundationHeroTemplate = createTemplate<FoundationHeroContent>({
  name: "foundation-hero",
  description: "Rizom foundation hero — centered editorial manifesto intro",
  schema: FoundationHeroContentSchema,
  formatter: foundationHeroFormatter,
  requiredPermission: "public",
  layout: { component: FoundationHeroLayout },
});
