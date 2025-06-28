import { StructuredContentFormatter } from "@brains/utils";
import { landingHeroDataSchema, type LandingHeroData } from "./schema";

export class HeroSectionFormatter extends StructuredContentFormatter<LandingHeroData> {
  constructor() {
    super(landingHeroDataSchema, {
      title: "Hero Section",
      mappings: [
        { key: "headline", label: "Headline", type: "string" },
        { key: "subheadline", label: "Subheadline", type: "string" },
        { key: "ctaText", label: "CTA Text", type: "string" },
        { key: "ctaLink", label: "CTA Link", type: "string" },
      ],
    });
  }
}
