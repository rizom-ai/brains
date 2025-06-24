export { FeaturesLayout } from "./layout";
export { featuresSectionSchema, type FeaturesSection } from "./schema";
export { FeaturesSectionFormatter } from "./formatter";

import { featuresSectionSchema } from "./schema";
import { FeaturesLayout } from "./layout";
import { FeaturesSectionFormatter } from "./formatter";
import featuresPrompt from "./prompt.txt";

export const featuresTemplate = {
  name: "features",
  description: "Features section with cards",
  schema: featuresSectionSchema,
  component: FeaturesLayout,
  formatter: new FeaturesSectionFormatter(),
  prompt: featuresPrompt,
  interactive: false,
};