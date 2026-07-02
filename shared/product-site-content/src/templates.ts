import { heroTemplate } from "./hero";
import { featuresTemplate } from "./features";
import { productsTemplate } from "./products";
import { ctaTemplate } from "./cta";
import { metadataTemplate } from "./metadata";
import { footerTemplate } from "./footer";
import type { Template } from "@brains/templates";

export const templates: Record<string, Template> = {
  hero: heroTemplate,
  features: featuresTemplate,
  products: productsTemplate,
  cta: ctaTemplate,
  metadata: metadataTemplate,
  footer: footerTemplate,
};
