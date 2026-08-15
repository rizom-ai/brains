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
  generateMarkdownWithFrontmatter,
  contentVisibilitySchema,
  createTemplate,
  defineDataSource,
  defineEntityDataSource,
  defineProjectionRule,
  paginationInfoSchema,
  parseMarkdownWithFrontmatter,
} from "@brains/plugins";
export type {
  AnyDataSourceDeclaration,
  AnyEntityDataSourceDefinition,
  BaseQuery,
  DataSourceDefinition,
  EntityAttachmentDeclaration,
  EntityConversationReader,
  EntityCreateRoute,
  EntityCreateRouting,
  EntityDataSourceDefinition,
  EntityEvalContext,
  EntityEvalDeclaration,
  EntityGenerationContext,
  EntityGenerationDeclaration,
  EntityGenerationEntityAccess,
  EntityJobDeclaration,
  IEntityAINamespace,
  EntityDetailContext,
  EntityQueryReader,
  MediaAttachmentContext,
  ProjectionEntityReader,
  ProjectionExecutionContext,
  ProjectionInputContext,
  ProjectionRule,
  ProjectionRuleDefinition,
  ProjectionWriteIntent,
  ProjectionWaveTrigger,
  NavigationResult,
  SortField,
  Template,
} from "@brains/plugins";

// Structured body content. Entities that keep prose in markdown sections
// rather than frontmatter parse and format it with this; consumer today
// is @brains/series.
export { StructuredContentFormatter } from "@brains/content-formatters";
export type { ContentFormatter } from "@brains/content-formatters";
export type { JsonValue } from "@brains/contracts";

// AT Protocol projection, for entities that publish records. The runtime
// owns registration, so the registry itself stays internal — an author
// only builds the projection.
export { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
export type {
  AtprotoBrainSeriesRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
} from "@brains/atproto-contracts";

// Text and markdown helpers used when authoring entities. Promoted from
// @brains/utils; consumers today are @brains/doc and @brains/products.
export { slugify } from "@brains/utils/string-utils";
export { computeContentHash } from "@brains/utils/hash";
export { parseMarkdown } from "@brains/utils/markdown";

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
