import { StructuredContentFormatter } from "@brains/utils";
import { HeroContentSchema, type HeroContent } from "./schema";

export class HeroFormatter extends StructuredContentFormatter<HeroContent> {
  constructor() {
    super(HeroContentSchema, {
      title: "Hero Section",
      mappings: [
        { key: "headline", label: "Headline", type: "string" },
        { key: "subhead", label: "Subhead", type: "string" },
        { key: "primaryCtaLabel", label: "Primary CTA Label", type: "string" },
        { key: "primaryCtaHref", label: "Primary CTA Href", type: "string" },
        {
          key: "secondaryCtaLabel",
          label: "Secondary CTA Label",
          type: "string",
        },
        {
          key: "secondaryCtaHref",
          label: "Secondary CTA Href",
          type: "string",
        },
      ],
    });
  }
}
