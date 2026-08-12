export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
export { BaseEntityFormatter } from "./base-entity-formatter";
export { BaseEntityAdapter, FallbackEntityAdapter } from "./adapters";
export type {
  BaseEntityAdapterConfig,
  BaseEntityFrontmatterSchema,
  DefaultEntityFrontmatter,
} from "./adapters";
export { SingletonEntityService } from "./singleton-entity-service";
export {
  ProjectionJsonObjectSchema,
  ProjectionJsonValueSchema,
  ProjectionWriteIntentSchema,
  type ProjectionEntityWrite,
  type ProjectionJsonObject,
  type ProjectionJsonValue,
  type ProjectionWriteIntent,
} from "./projection-contracts";
export {
  ProjectionStore,
  type ApplyProjectionRuleResultInput,
  type ClaimProjectionWaveInput,
  type GetProjectionRuleMemoInput,
  type MarkProjectionDirtyInput,
  type ProjectionIncidentInput,
  type ProjectionRuleMemoValue,
  type ProjectionWaveRuleInput,
} from "./projection-store";
export type {
  ProjectionChangedTarget,
  ProjectionDirtyInput,
  ProjectionIncident,
  ProjectionRuleMemo,
  ProjectionWave,
  ProjectionWaveInput,
  ProjectionWaveRule,
} from "./schema/projection-state";
export {
  EntityValidationError,
  hasValidationIssues,
  isEntityValidationError,
  toEntityValidationError,
} from "./errors";

// Embedding
export type {
  IEmbeddingService,
  EmbeddingUsage,
  EmbeddingResult,
  BatchEmbeddingResult,
} from "./embedding-types";

// Embedding database
export {
  createEmbeddingDatabase,
  migrateEmbeddingDatabase,
  ensureEmbeddingIndexes,
  attachEmbeddingDatabase,
  dbUrlToPath,
} from "./db/embedding-db";
export type { EmbeddingDB } from "./db/embedding-db";

export type {
  BaseEntity,
  CreateCoverImageInput,
  CreateFromAttachmentInput,
  CreateFromConversationMessageInput,
  CreateFromInput,
  CreateFromUploadInput,
  CreateInput,
  CreateExecutionContext,
  CreateResult,
  CreateInterceptionResult,
  CreateInterceptor,
  UploadSaveInput,
  UploadSaveHandler,
  UploadSaveHandlerRegistration,
  PersistValidator,
  EntityInput,
  SearchResult,
  EntityAdapter,
  EntitySchema,
  EntitySchemaParser,
  FrontmatterSchema,
  ListOptions,
  SearchOptions,
  GetEntityRequest,
  GetEntityRawRequest,
  ProjectSemanticSpaceRequest,
  SemanticEntityReference,
  SemanticSpaceDistanceRange,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
  ListEntitiesRequest,
  CountEntitiesRequest,
  EntitySearchRequest,
  SearchWithDistancesRequest,
  EntityRegistry as IEntityRegistry,
  EntityService as IEntityService,
  ICoreEntityService,
  IEntitiesNamespace,
  EntityDbConfig,
  EntityTypeConfig,
  ProjectionSourceRole,
  EntityJobOptions,
  EntityMutationEventContext,
  EntityEventBus,
  ContentVisibility,
  RawContentVisibility,
  CreateEntityOptions,
  UpdateEntityOptions,
  CreateEntityFromMarkdownInput,
  EntityMutationResult,
  StoreEmbeddingData,
  SortField,
} from "./types";

export {
  baseEntityParserSchema,
  baseEntitySchema,
  NOTE_ENTITY_TYPE,
  canWriteVisibility,
  canonicalContentVisibilitySchema,
  contentVisibilitySchema,
  createResultAttachmentSchema,
  emptyFrontmatterSchema,
  getVisibleContentVisibilities,
  isVisibleWithinScope,
  normalizeContentVisibility,
  permissionToVisibilityScope,
} from "./types";

export { buildGenerationStubEntity } from "./generation-stub";
export { internalFullScope } from "./internal-scope";
export { scopedDerivedId } from "./scoped-derived-id";
export {
  getPublishBoundaryState,
  type PublishBoundaryState,
} from "./publish-policy";

export {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
  extractVisibilityFromMarkdown,
  applyVisibilityToMarkdown,
  hasVisibilityFrontmatter,
  type FrontmatterConfig,
} from "./frontmatter";

// Datasource (merged from @brains/datasource)
export { DataSourceRegistry } from "./datasource-registry";
export type {
  DataSource,
  DataSourceSchema,
  DataSourceCapabilities,
  BaseDataSourceContext,
} from "./types";
export {
  paginationInfoSchema,
  paginateItems,
  buildPaginationInfo,
} from "./pagination";
export type {
  PaginationInfo,
  PaginateOptions,
  PaginateResult,
} from "./pagination";
export { findEntityByIdentifier, resolveEntityOrError } from "./find-entity";
export type { ResolvedEntity } from "./find-entity";
