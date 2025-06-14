import type { ContentTemplate } from "@brains/types";
import { featuresSectionSchema, type FeaturesSection } from "./schema";
import { FeaturesSectionFormatter } from "./formatter";
import featuresPrompt from "./prompt.txt";

/**
 * Features section template
 */
export const featuresSectionTemplate: ContentTemplate<FeaturesSection> = {
  name: "features-section",
  description: "Features section for pages",
  schema: featuresSectionSchema,
  formatter: new FeaturesSectionFormatter(),
  basePrompt: featuresPrompt,
};
