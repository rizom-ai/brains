import { StructuredContentFormatter } from "@brains/utils";
import { WorkshopContentSchema, type WorkshopContent } from "./schema";

export const workshopFormatter =
  new StructuredContentFormatter<WorkshopContent>(WorkshopContentSchema, {
    title: "Workshop Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "intro", label: "Intro", type: "string" },
      {
        key: "steps",
        label: "Steps",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "num", label: "Number", type: "string" },
          { key: "label", label: "Label", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "body", label: "Body", type: "string" },
        ],
      },
      { key: "ctaLabel", label: "CTA label", type: "string" },
      { key: "ctaHref", label: "CTA href", type: "string" },
    ],
  });
