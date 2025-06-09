import { StructuredContentFormatter } from "@brains/formatters";
import { featuresSectionSchema, type FeaturesSection } from "../content-schemas";

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
          itemFormat: (item): string => {
            const feature = item as { 
              icon: string; 
              title: string; 
              description: string;
              colorScheme?: string;
            };
            let result = `### ${feature.title}\n`;
            result += `- Icon: ${feature.icon}\n`;
            result += `- Description: ${feature.description}`;
            if (feature.colorScheme) {
              result += `\n- Color: ${feature.colorScheme}`;
            }
            return result;
          },
        },
      ],
    });
  }
}