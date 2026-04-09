import { StructuredContentFormatter } from "@brains/utils";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";

export const ecosystemFormatter =
  new StructuredContentFormatter<EcosystemContent>(EcosystemContentSchema, {
    title: "Ecosystem Section",
    mappings: [
      {
        key: "cards",
        label: "Cards",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "suffix", label: "Suffix", type: "string" },
          { key: "title", label: "Title", type: "string" },
          { key: "body", label: "Body", type: "string" },
          { key: "linkLabel", label: "Link Label", type: "string" },
          { key: "linkHref", label: "Link Href", type: "string" },
          {
            key: "active",
            label: "Active",
            type: "string",
            parser: (text: string): boolean =>
              text.trim().toLowerCase() === "true",
            formatter: (value: unknown): string =>
              value === true ? "true" : "false",
          },
          { key: "accent", label: "Accent", type: "string" },
        ],
      },
    ],
  });
