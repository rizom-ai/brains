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

// Entity presentation. An entity package that renders anything declares
// templates and the data sources behind them; without these on the public
// surface it has to reach into @brains/plugins and cannot be published.
// Named consumer: @brains/doc.
//
// `defineEntityDataSource` is deliberately the only way to declare one.
// The runtime `DataSource` interface cannot be published: its `fetch` takes
// a context carrying a scoped entity service, which reaches the projection
// store, so exporting it would drag the entity-service runtime into the
// generated declarations.
export {
  baseEntityParserSchema,
  contentVisibilitySchema,
  createTemplate,
  defineEntityDataSource,
  paginationInfoSchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
export type {
  AnyEntityDataSourceDefinition,
  BaseQuery,
  EntityDataSourceDefinition,
  EntityDetailContext,
  NavigationResult,
  SortField,
  Template,
} from "@brains/plugins";

// Text helpers used when authoring entity ids and slugs. Promoted from
// @brains/utils/string-utils; consumer today is @brains/doc.
export { slugify } from "@brains/utils/string-utils";

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
