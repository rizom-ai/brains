import { StructuredContentFormatter } from "@brains/utils";
import { EcosystemContentSchema, type EcosystemContent } from "./schema";

export class EcosystemFormatter extends StructuredContentFormatter<EcosystemContent> {
  constructor() {
    super(EcosystemContentSchema, {
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
              parser: (text) => text.trim().toLowerCase() === "true",
              formatter: (value) => (value ? "true" : "false"),
            },
            { key: "accent", label: "Accent", type: "string" },
          ],
        },
      ],
    });
  }
}
