/** Declarative public entity authoring surface. */

export { z } from "@brains/utils/zod";
export {
  defineEntity,
  defineEntityPackage,
  defineProjection,
} from "@brains/plugins";
export type {
  EncodedEntityMarkdown,
  EntityDefinition,
  EntityMarkdownCodec,
  EntityMarkdownDocument,
  EntityOf,
  EntityPackageDefinition,
  ProjectionDefinition,
} from "@brains/plugins";

export type {
  BaseEntity,
  EntityInput,
  EntityMutationResult,
  SearchResult,
  ListOptions,
  SearchOptions,
  PaginationInfo,
  PaginateOptions,
  PaginateResult,
  FrontmatterConfig,
} from "@brains/entity-service";

// Style guide contract. Entity packages that generate prose or imagery
// read the brain's house style through this; consumer today is
// @brains/style-guide, which owns the entity itself.
export {
  DEFAULT_STYLE_GUIDE,
  fetchStyleGuide,
  fetchVoiceGuidance,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
  parseStyleGuideContent,
  styleGuideFromEntity,
  styleGuideFrontmatterSchema,
  styleGuideMessagingSchema,
  styleGuideVisualSchema,
  styleGuideVoiceSchema,
} from "@brains/contracts";
export type {
  FormattedStyleGuidance,
  StyleGuide,
  StyleGuideEntityReader,
  StyleGuideFrontmatter,
  StyleGuideMessaging,
  StyleGuideVisual,
  StyleGuideVoice,
} from "@brains/contracts";
