import { StructuredContentFormatter } from "@brains/utils";
import { ResearchContentSchema, type ResearchContent } from "./schema";

export const researchFormatter =
  new StructuredContentFormatter<ResearchContent>(ResearchContentSchema, {
    title: "Research Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "subhead", label: "Subhead", type: "string" },
      {
        key: "essays",
        label: "Essays",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "num", label: "Number", type: "string" },
          { key: "series", label: "Series", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "teaser", label: "Teaser", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      { key: "ctaLabel", label: "CTA label", type: "string" },
      { key: "ctaHref", label: "CTA href", type: "string" },
    ],
  });
