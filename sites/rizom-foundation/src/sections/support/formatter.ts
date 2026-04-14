import { StructuredContentFormatter } from "@brains/utils";
import { SupportContentSchema, type SupportContent } from "./schema";

export const supportFormatter = new StructuredContentFormatter<SupportContent>(
  SupportContentSchema,
  {
    title: "Support Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      {
        key: "cards",
        label: "Cards",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "tone", label: "Tone", type: "string" },
          { key: "label", label: "Label", type: "string" },
          { key: "headline", label: "Headline", type: "string" },
          { key: "body", label: "Body", type: "string" },
          { key: "linkLabel", label: "Link label", type: "string" },
          { key: "linkHref", label: "Link href", type: "string" },
        ],
      },
    ],
  },
);
