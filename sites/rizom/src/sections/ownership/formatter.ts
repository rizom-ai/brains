import { StructuredContentFormatter } from "@brains/utils";
import { OwnershipContentSchema, type OwnershipContent } from "./schema";

export const ownershipFormatter =
  new StructuredContentFormatter<OwnershipContent>(OwnershipContentSchema, {
    title: "Ownership Section",
    mappings: [
      { key: "badge", label: "Badge", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      {
        key: "features",
        label: "Features",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "icon", label: "Icon", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "body", label: "Body", type: "string" },
        ],
      },
    ],
  });
