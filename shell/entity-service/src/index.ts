export { EntityService } from "./entityService";
export { EntityRegistry } from "./entityRegistry";
export { EmbeddingJobHandler } from "./handlers/embeddingJobHandler";
export { BaseEntityFormatter } from "./base-entity-formatter";
export { BaseEntityAdapter, FallbackEntityAdapter } from "./adapters";
export { SingletonEntityService } from "./singleton-entity-service";

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
  enableWALModeForEmbeddings,
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
  ListOptions,
  SearchOptions,
  GetEntityRequest,
  GetEntityRawRequest,
  ListEntitiesRequest,
  CountEntitiesRequest,
  EntitySearchRequest,
  EntityRegistry as IEntityRegistry,
  EntityService as IEntityService,
  ICoreEntityService,
  IEntitiesNamespace,
  EntityDbConfig,
  EntityTypeConfig,
  EntityJobOptions,
  EntityMutationEventContext,
  EntityEventBus,
  ContentVisibility,
  RawContentVisibility,
  CreateEntityOptions,
  CreateEntityFromMarkdownInput,
  EntityMutationResult,
  StoreEmbeddingData,
  SortField,
} from "./types";

export {
  baseEntitySchema,
  NOTE_ENTITY_TYPE,
  canWriteVisibility,
  contentVisibilitySchema,
  createResultAttachmentSchema,
  getVisibleContentVisibilities,
  isVisibleWithinScope,
  normalizeContentVisibility,
  permissionToVisibilityScope,
} from "./types";

export { buildGenerationStubEntity } from "./generation-stub";
export { internalFullScope } from "./internal-scope";
export { scopedDerivedId } from "./scoped-derived-id";

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
  DataSourceCapabilities,
  BaseDataSourceContext,
} from "./datasource-types";
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
