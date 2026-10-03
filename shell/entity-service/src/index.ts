export {
  entityTypeClassificationSchema,
  type EntityTypeClassification,
} from "./entity-type-classification";
export { isGroupingContributor } from "./grouping-eligibility";
export {
  ASSET_CHUNK_BYTES,
  ASSET_REF_PATTERN,
  ASSET_REF_PREFIX,
  MAX_ASSET_BYTES,
  SHA256_DIGEST_PATTERN,
  assetRecordSchema,
  assetRefSchema,
  base64AssetSource,
  computeAssetDigest,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  readAssetBytes,
  type AssetOpener,
  type AssetReader,
  type AssetRecord,
  type AssetRef,
  type AssetSource,
  type AssetStat,
  type AssetVerification,
  type StageAssetOptions,
  type StagedAsset,
} from "@brains/assets";
export {
  EntityService,
  type LegacyBinaryMaterialization,
} from "./entityService";
export {
  decodeEntityIdPath,
  encodeEntityIdPath,
  entityIdPathSchema,
  type EntityIdPath,
  type EntityIdPathInput,
} from "./entity-id-path";
export { EntityRegistry } from "./entityRegistry";
export {
  entityGroupingSchema,
  groupingSortSchema,
  groupingKeySchema,
  groupingValueSchema,
  groupingSearchSchema,
  GROUPING_PAGE_LIMIT,
  GROUPING_MAX_PAGE_LIMIT,
  type EntityGrouping,
  type GroupingSort,
  queryGroupingUsageSchema,
  type QueryGroupingUsageRequest,
  type EntityGroupingUsage,
  type QueryGroupingCatalogRequest,
  type QueryGroupingMembersRequest,
  type EntityGroupingCatalog,
} from "./entity-grouping";
export type { EntityGroupingMembers } from "./types";
export {
  entityWriteConditionSchema,
  EntityWriteConflictError,
  type EntityWriteCondition,
} from "./entity-write-contracts";
export type { EntityWriteSnapshot } from "./types";
export { entityRevision } from "./entity-revision";
export {
  entityMutationReceiptKeySchema,
  entityMutationReceiptSchema,
} from "./entity-mutation-receipt";
export type {
  EntityMutationReceipt,
  EntityMutationReceiptKey,
} from "./entity-mutation-receipt";
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
  AssetIntegrityError,
  AssetNotFoundError,
} from "./sqlite-asset-repository";
export {
  ProjectionBatchFencedError,
  ProjectionStore,
  type ApplyProjectionRuleResultInput,
  type ProjectionBatchDiagnostics,
  type ClaimProjectionWaveInput,
  type GetProjectionRuleMemoInput,
  type MarkProjectionDirtyInput,
  type ProjectionOwnedEntityInput,
  type ProjectionIncidentDiagnostics,
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
export type {
  ProjectionBatch,
  ProjectionBatchChild,
} from "./schema/projection-batches";
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
  attachEmbeddingDatabase,
  dbUrlToPath,
} from "./db/embedding-db";
export type { EmbeddingDB } from "./db/embedding-db";

export type {
  BaseEntity,
  BulkMutationInput,
  DurableBulkMutationChildInput,
  DurableBulkMutationRootInput,
  ProjectionBatchOwnedJob,
  ProjectionBatchRecoveryResult,
  ProjectionBatchRootReader,
  EntityExportIntent,
  EntityExportAcknowledgement,
  AcknowledgeEntityExportsRequest,
  SettleDurableBulkMutationChildInput,
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
  EntityReadOptions,
  GetEntityRawRequest,
  ProjectionOwnedEntityRequest,
  CreateEntityRequest,
  UpdateEntityRequest,
  FoldEntityRequest,
  ApplyEntityMutationOnceRequest,
  UpsertEntityRequest,
  ProjectSemanticSpaceRequest,
  SemanticEntityReference,
  SemanticSpaceDistanceRange,
  SemanticSpaceNeighbor,
  SemanticSpaceOrigin,
  SemanticSpacePoint,
  SemanticSpaceProjection,
  ListEntitiesRequest,
  QueryEntityHierarchyRequest,
  EntityHierarchyPage,
  CountEntitiesRequest,
  EntitySearchRequest,
  SearchWithDistancesRequest,
  EntityRegistry as IEntityRegistry,
  BinaryContentMode,
  EntityService as IEntityService,
  ReadOnlyEntityService,
  EntityServiceClient,
  DurableBulkMutationCoordinator,
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
export { scopeEntityReads } from "./scoped-entity-reads";
export type { EntityReadScope } from "./scoped-entity-reads";
export { scopedDerivedId } from "./scoped-derived-id";
export {
  getPublishBoundaryState,
  type PublishBoundaryState,
} from "./publish-policy";

export { preserveSourceFrontmatter } from "./frontmatter-extensions";
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
export { MAX_SEARCH_QUERY_CHARS } from "./entity-search";
export { InMemoryDataSourceRegistry } from "./datasource-registry";
export type { DataSourceRegistry } from "./datasource-registry";
export type {
  DataSource,
  DataSourceGenerationContext,
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
export type { EntityLookupOptions, ResolvedEntity } from "./find-entity";
export {
  openOfflineEntityDatabase,
  readBinaryAssetInventory,
  readInlineBinaryRow,
  type BinaryAssetInventory,
  type InlineBinaryRow,
  type OfflineEntityConnection,
  type OfflineReader,
} from "./offline/binary-asset-inventory";
export {
  verifyAssetBackedRows,
  type AssetBackedVerification,
  type AssetRowCheck,
} from "./offline/binary-asset-verification";
export {
  OfflineBinaryMigrator,
  type AssetRestoreInput,
  type AssetRestoreOutcome,
  type AssetRowInput,
  type AssetRowOutcome,
  type InlineRowMigrationInput,
  type InlineRowMigrationOutcome,
  type PlaceholderClearInput,
  type PlaceholderClearOutcome,
} from "./offline/binary-asset-migration";
