import { StructuredContentFormatter } from "@brains/formatters";
import { landingPageSchema, type LandingPageData } from "../content-schemas";

export class LandingPageFormatter extends StructuredContentFormatter<LandingPageData> {
  constructor() {
    super(landingPageSchema, {
      title: "Landing Page Configuration",
      mappings: [
        { key: "title", label: "Title", type: "string" },
        { key: "tagline", label: "Tagline", type: "string" },
        {
          key: "hero",
          label: "Hero",
          type: "object",
          children: [
            { key: "headline", label: "Headline", type: "string" },
            { key: "subheadline", label: "Subheadline", type: "string" },
            { key: "ctaText", label: "CTA Text", type: "string" },
            { key: "ctaLink", label: "CTA Link", type: "string" },
          ],
        },
      ],
    });
  }
}
