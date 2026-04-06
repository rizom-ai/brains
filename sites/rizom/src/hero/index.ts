export { HeroLayout } from "./layout";
export { HeroContentSchema, type HeroContent } from "./schema";

import { HeroContentSchema, type HeroContent } from "./schema";
import { HeroLayout } from "./layout";
import { createTemplate } from "@brains/templates";

/**
 * Rizom hero template.
 *
 * No dataSourceId — the hero renders static, variant-appropriate copy
 * from the layout's defaults. Instances can override individual fields
 * by dropping a `site-content` entity at `home:hero` in brain-data/.
 */
export const heroTemplate = createTemplate<HeroContent>({
  name: "hero",
  description: "Rizom site hero section — variant-aware defaults",
  schema: HeroContentSchema,
  requiredPermission: "public",
  layout: {
    component: HeroLayout,
  },
});
