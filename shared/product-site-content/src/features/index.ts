export { FeaturesLayout } from "./layout";
export { featuresSectionSchema, type FeaturesSection } from "./schema";
export { FeaturesSectionFormatter } from "./formatter";

import { featuresSectionSchema, type FeaturesSection } from "./schema";
import { FeaturesLayout } from "./layout";
import { FeaturesSectionFormatter } from "./formatter";
import featuresPrompt from "./prompt.txt";
import { createTemplate, type Template } from "@brains/templates";

export const featuresTemplate: Template = createTemplate<FeaturesSection>({
  name: "features",
  description: "Features section with cards",
  schema: featuresSectionSchema,
  basePrompt: featuresPrompt,
  dataSourceId: "shell:ai-content",
  requiredPermission: "public",
  formatter: new FeaturesSectionFormatter(),
  layout: {
    component: FeaturesLayout,
  },
});
