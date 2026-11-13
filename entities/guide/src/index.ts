import {
  defineEntityPackage,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { guidesConfigSchema } from "./config";
import { guideDataSource } from "./datasources/guide-datasource";
import { guideSectionsDataSource } from "./datasources/guide-sections-datasource";
import { guide } from "./guide";

/**
 * The guides: one entity, a guide, rendered by the guide templates through
 * the guide data sources, which hand every page the configured chrome, and
 * list each docs section's guides beside its docs.
 */
export const guidesPackage: EntityPackageDefinition<
  readonly [typeof guide],
  readonly [],
  typeof guidesConfigSchema
> = defineEntityPackage({
  id: "guides",
  config: guidesConfigSchema,
  entities: [guide],
  configure: ({ config }) => ({
    dataSources: [guideDataSource(config), guideSectionsDataSource()],
  }),
});

export default guidesPackage;

export { guide, statedGuideFields } from "./guide";
export {
  guideDataSource,
  listGuides,
  parseGuideData,
} from "./datasources/guide-datasource";
export { guideSectionsDataSource } from "./datasources/guide-sections-datasource";
export {
  guideSectionSchema,
  guideSectionsSchema,
  sectionDocSchema,
  type GuideSection,
  type GuideSectionsData,
  type SectionDoc,
} from "./schemas/guide-sections";
export { GuideListTemplate, type GuideListProps } from "./templates/guide-list";
export { GuideBandTemplate } from "./templates/guide-band";
export {
  GuideSectionsTemplate,
  type GuideSectionsProps,
} from "./templates/guide-sections";
export { GuideCard, GuideCards } from "./templates/guide-card";
export {
  GuideDetailTemplate,
  type GuideDetailProps,
} from "./templates/guide-detail";
export {
  guideFrontmatterSchema,
  guideMaterialSchema,
  guideRecipeSchema,
  type GuideFrontmatter,
  type GuideMaterial,
  type GuideRecipe,
} from "./schemas/guide-frontmatter";
export {
  guideSchema,
  guideMetadataSchema,
  guideWithDataSchema,
  type Guide,
  type GuideMetadata,
  type GuideWithData,
} from "./schemas/guide";
export {
  parseGuideStages,
  guideStageSchema,
  guideStepLinkSchema,
  type GuideStage,
  type GuideStepLink,
} from "./lib/guide-stages";
export { guideHref, guideRecipeLabel, sortGuides } from "./lib/guide-order";
export {
  closingHeading,
  guideRecipeHighlights,
  materialFragments,
  type MaterialFragment,
} from "./lib/guide-page-content";
export {
  guidesConfigSchema,
  type GuidesConfig,
  type GuidesConfigInput,
} from "./config";
