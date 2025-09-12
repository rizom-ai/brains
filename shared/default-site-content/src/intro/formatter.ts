import { StructuredContentFormatter } from "@brains/utils";
import { IntroContentSchema, type IntroContent } from "./schema";

export class IntroSectionFormatter extends StructuredContentFormatter<IntroContent> {
  constructor() {
    super(IntroContentSchema, {
      title: "Intro Section",
      mappings: [
        { key: "tagline", label: "Tagline", type: "string" },
        { key: "description", label: "Description", type: "string" },
        {
          key: "features",
          label: "Features",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "icon", label: "Icon", type: "string" },
            { key: "title", label: "Title", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
      ],
    });
  }
}
