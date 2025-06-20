import { StructuredContentFormatter } from "@brains/structured-content";
import { generalContextSchema, type GeneralContext } from "./schema";

export class GeneralContextFormatter extends StructuredContentFormatter<GeneralContext> {
  constructor() {
    super(generalContextSchema, {
      title: "General Context",
      mappings: [
        { key: "organizationName", label: "Organization Name", type: "string" },
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "mission", label: "Mission", type: "string" },
        { key: "vision", label: "Vision", type: "string" },
        {
          key: "values",
          label: "Values",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "name", label: "Name", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
        { key: "tone", label: "Tone", type: "string" },
        { key: "themes", label: "Themes", type: "array", itemType: "string" },
        {
          key: "audience",
          label: "Audience",
          type: "object",
          children: [
            { key: "primary", label: "Primary", type: "string" },
            { key: "secondary", label: "Secondary", type: "string" },
          ],
        },
        {
          key: "focusAreas",
          label: "Focus Areas",
          type: "array",
          itemType: "string",
        },
      ],
    });
  }
}
