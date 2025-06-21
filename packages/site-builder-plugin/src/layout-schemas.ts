import type { LayoutDefinition } from "@brains/types";

// Import schemas from the layout directories
import { HeroLayoutSchema } from "../layouts/hero/schema";
import { FeaturesLayoutSchema } from "../layouts/features/schema";
import { ProductsLayoutSchema } from "../layouts/products/schema";
import { CTALayoutSchema } from "../layouts/cta/schema";

// Built-in layout definitions
export const builtInLayouts: LayoutDefinition[] = [
  {
    name: "hero",
    schema: HeroLayoutSchema,
    component: "@brains/site-builder/layouts/hero/hero.astro",
    description: "Hero section with headline and call-to-action",
  },
  {
    name: "features",
    schema: FeaturesLayoutSchema,
    component: "@brains/site-builder/layouts/features/features.astro",
    description: "Feature grid with icons",
  },
  {
    name: "products",
    schema: ProductsLayoutSchema,
    component: "@brains/site-builder/layouts/products/products.astro",
    description: "Product card grid",
  },
  {
    name: "cta",
    schema: CTALayoutSchema,
    component: "@brains/site-builder/layouts/cta/cta.astro",
    description: "Call-to-action section",
  },
];

export type BuiltInLayoutName = (typeof builtInLayouts)[number]["name"];
