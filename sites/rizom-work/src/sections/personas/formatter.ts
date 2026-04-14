import { StructuredContentFormatter } from "@brains/utils";
import { PersonasContentSchema, type PersonasContent } from "./schema";

export const personasFormatter =
  new StructuredContentFormatter<PersonasContent>(PersonasContentSchema, {
    title: "Personas Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      {
        key: "cards",
        label: "Cards",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "label", label: "Label", type: "string" },
          { key: "quote", label: "Quote", type: "string" },
          { key: "body", label: "Body", type: "string" },
        ],
      },
    ],
  });
