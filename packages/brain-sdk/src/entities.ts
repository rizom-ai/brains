/** Declarative public entity authoring surface. */

export { z } from "@brains/utils/zod";
export {
  ProjectionJsonObjectSchema,
  defineEntity,
  defineEntityPackage,
  defineProjection,
  // A rule that derives across visibility scopes needs both: the predicate
  // that decides whether a source is in scope, and the id scheme that keeps
  // a public and a shared derivation of the same title apart.
  isVisibleWithinScope,
  scopedDerivedId,
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
  JobEntityAccess,
  JobHandlerContext,
  AnyEntityJobDeclaration,
  EntityGenerationJobDeclaration,
  EntityGenerationResult,
  EntityJobDeclaration,
  EntityPublishDeclaration,
  IEntityAINamespace,
  EntityDetailContext,
  EntityQueryReader,
  MediaAttachmentContext,
  ProjectionEntityReader,
  ProjectionExecutionContext,
  ProjectionInputContext,
  ProjectionRule,
  ProjectionRuleDefinition,
  ProjectionSourceRole,
  ResolvedRuntimeUpload,
  RuntimeUploadRecord,
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

// Create routing. A route that resolves inline returns what should be
// written rather than writing it, so the runtime still reports what
// happened. Named consumer: @brains/wishlist.
// A route that allocates instead delegates the slow part to a declared
// job, and may hand back a link to the artifact before it exists — the id
// is already allocated, so the URL already is too. Named consumer:
// @brains/document.
export type {
  CreateResultAttachment,
  EntityCreateAllocation,
  EntityCreateAttachment,
  EntityCreateContext,
  EntityCreateDelegation,
  EntityCreateResolution,
  EntityGenerationLink,
} from "@brains/plugins";

// Dashboard widgets an entity type contributes. Four packages waited on a
// lifecycle event by hand to register one; declared, the runtime owns the
// wait. Named consumer: @brains/wishlist.
export { defineDashboardWidget } from "@brains/plugins";
export { defineEntityDashboardWidget } from "@brains/plugins";
export type {
  DashboardOperatorViewBlock,
  DashboardWidgetDefinition,
  EntityConversationSurvey,
  EntityDashboardWidgetContext,
  EntityDashboardWidgetDeclaration,
} from "@brains/plugins";

// Syndication. An entity says how one of its entities becomes a feed item;
// the site build owns which entities qualify and where the file goes. The
// declaration is on the public entity surface, so the item it returns has
// to be too. Named consumer: @brains/blog.
export type { EntityFeedDeclaration } from "@brains/plugins";

// Attachments. An entity declares the artifacts it can produce — a
// printable, a social preview — and supplies the provider that builds one.
// Named consumers: @brains/blog, @brains/decks, @brains/portfolio.
export type { AttachmentProvider } from "@brains/plugins";
export type { PublishMediaData } from "@brains/contracts";

// What a media page prints in its header: the site's own name and URL.
export { fetchSiteInfo } from "@brains/site-composition";
export type { FeedItem } from "@brains/site-composition";

// Generation helpers. A package that writes an entity from a prompt has to
// avoid colliding with one that already exists, and the retry-with-a-new-
// title loop is the runtime's to own rather than each package's. Named
// consumers: @brains/blog, @brains/decks, @brains/social-media.
export { ensureUniqueTitle } from "@brains/plugins";

// Whether an artifact derived from another entity's attachment is still the
// artifact for that source. Two packages render these and both ask before
// doing the work, so the staleness rule has one place to change. Named
// consumers: @brains/document-plugin, @brains/image-plugin.
export { sourceAttachmentKey } from "@brains/plugins";

// Whether a conversation space matches a configured selector. A package that
// filters by space must not spell the matching rule itself, or two packages
// disagree about what "#build" covers. Named consumer:
// @brains/conversation-memory.
export { matchSpaceSelector } from "@brains/plugins";

// Where a package's own entities sit relative to each other, bounded to the
// type it declares. The full namespace would let it project every entity in
// the brain. Named consumer: @brains/agent-discovery.
export type { EntitySemanticReader } from "@brains/plugins";
export type {
  ProjectSemanticSpaceRequest,
  SemanticSpaceNeighbor,
  SemanticSpacePoint,
  SemanticSpaceProjection,
} from "@brains/entity-service";

// Projection plumbing: what a derived entity was derived from, and
// reconciling a derived set against what exists. Named consumer:
// @brains/agent-discovery, whose skills are derived from topic and agent
// evidence.
export {
  computeProjectionInputFingerprint,
  reconcileEntities,
} from "@brains/plugins";

// Grounding a package offers the agent before it answers. The runtime owns
// the channel, the parse, the envelope, and scoping the reads to what the
// asker may see. Named consumer: @brains/conversation-memory.
export type { EntityAgentContextProvider } from "@brains/plugins";

// Reacting to something that happened: a card found on the network, a
// cadence coming round, an item to act on. The runtime owns the channel and
// the parse; a package says what the event means to it. Named consumer:
// @brains/agent-discovery.
// Bookkeeping that is not an entity — "I already told someone about this
// peer". Scoped by namespace and validated by a schema, so one package's
// notes cannot be read or corrupted by another's.
export type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";

// What an inbox item is, and who is acting on it. A package that declares
// an inbox source has to name what it puts there.
export { inboxItemListSchema } from "@brains/plugins";
export type { InboxActor, InboxItem, InboxItemDetail } from "@brains/plugins";

export type {
  EntityAtprotoDiscovery,
  EntityCheckDeclaration,
  EntityInboxDeclaration,
  EntityReactionContext,
} from "@brains/plugins";
export type { AgentContextItem, AgentContextRequest } from "@brains/contracts";

// The logger a declaration is handed. Narrow by design: a package reports
// what it did, it does not configure logging.
export type { LoggerContract } from "@brains/utils/logger";

// Who authored a stored message, and the schema that reads it back off one.
// A package that attributes what it derived has to name the author. Named
// consumer: @brains/conversation-memory.
export { conversationMessageMetadataSchema } from "@brains/plugins";
export type { ConversationMessageActor } from "@brains/plugins";

// Bounded concurrency. Deriving memory from many conversations at once is
// the kind of fan-out that needs a ceiling, and every package inventing its
// own gets it subtly wrong.
export { pLimit } from "@brains/utils/p-limit";

// AT Protocol projection, for entities that publish records. The runtime
// owns registration, so the registry itself stays internal — an author
// only builds the projection.
export { canonicalAtprotoLexicons } from "@brains/atproto-contracts";
// One record type per entity type that projects. Promoted together rather
// than as each package converts: they are the same shape, and a package
// building its own projection cannot do so without the record it writes.
export type {
  AtprotoBlobRef,
  AtprotoBrainCardRecord,
  AtprotoBrainDeckRecord,
  AtprotoBrainLinkRecord,
  AtprotoBrainNoteRecord,
  AtprotoBrainPostRecord,
  AtprotoBrainProjectRecord,
  AtprotoBrainSeriesRecord,
  AtprotoBrainSocialPostRecord,
  AtprotoBrainTopicRecord,
  AtprotoProjection,
  AtprotoProjectionBuildInput,
  AtprotoProjectionContext,
} from "@brains/atproto-contracts";

// The brain's own identity and declared skills, which an entity assessing
// its capabilities reads. Named consumer: @brains/assessment.
export { anchorProfileKindSchema, skillDataSchema } from "@brains/plugins";
export type {
  AnchorProfileKind,
  ProfileCategory,
  SkillData,
} from "@brains/plugins";

// Text and markdown helpers used when authoring entities. Promoted from
// @brains/utils; consumers today are @brains/doc and @brains/products.
export {
  calculateReadingTime,
  firstSentence,
  slugify,
  slugifyUrl,
  truncateText,
} from "@brains/utils/string-utils";
export { computeContentHash } from "@brains/utils/hash";
// The repo's one way to turn a caught error into a message — a lint rule
// enforces it over an inline instanceof ternary, so a package that cannot
// reach it cannot pass lint. Named consumer: @brains/image-plugin.
export { getErrorMessage } from "@brains/utils/error";

// The conversation a job was started from, and what was said in it. A
// package that summarises conversations has to name what it read. Named
// consumer: @brains/conversation-memory.
export type { Conversation, Message } from "@brains/plugins";

// Who said a thing, and the one way to key them. A summary attributes what
// it records, and two records of the same person must land on the same key
// or the summary lists them twice. Named consumer: @brains/conversation-memory.
export {
  actorRefFromLegacy,
  actorRefKey,
  actorRefSchema,
} from "@brains/contracts";
export type { ActorRef } from "@brains/contracts";

// How far a piece of content may travel. Paired with contentVisibilitySchema
// above, which validates it.
export type { ContentVisibility } from "@brains/plugins";
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
