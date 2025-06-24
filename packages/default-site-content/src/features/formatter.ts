import { StructuredContentFormatter } from "@brains/structured-content";
import { featuresSectionSchema, type FeaturesSection } from "./schema";

export class FeaturesSectionFormatter extends StructuredContentFormatter<FeaturesSection> {
  constructor() {
    super(featuresSectionSchema, {
      title: "Features Section",
      mappings: [
        { key: "label", label: "Label", type: "string" },
        { key: "headline", label: "Headline", type: "string" },
        { key: "description", label: "Description", type: "string" },
        {
          key: "features",
          label: "Feature Cards",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "title", label: "Title", type: "string" },
            { key: "icon", label: "Icon", type: "string" },
            { key: "description", label: "Description", type: "string" },
          ],
        },
      ],
    });
  }
}
