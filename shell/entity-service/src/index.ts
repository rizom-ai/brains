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
  CreateInput,
  CreateExecutionContext,
  CreateResult,
  CreateInterceptionResult,
  CreateInterceptor,
  EntityInput,
  SearchResult,
  EntityAdapter,
  ListOptions,
  SearchOptions,
  EntityRegistry as IEntityRegistry,
  EntityService as IEntityService,
  ICoreEntityService,
  EntityDbConfig,
  EntityTypeConfig,
  EntityJobOptions,
  EntityEventBus,
  CreateEntityOptions,
  CreateEntityFromMarkdownInput,
  EntityMutationResult,
  StoreEmbeddingData,
  SortField,
} from "./types";

export { baseEntitySchema, BASE_ENTITY_TYPE } from "./types";

export {
  generateMarkdownWithFrontmatter,
  parseMarkdownWithFrontmatter,
  generateFrontmatter,
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
