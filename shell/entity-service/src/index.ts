export {
  ASSET_REF_PATTERN,
  ASSET_REF_PREFIX,
  MAX_ASSET_BYTES,
  SHA256_DIGEST_PATTERN,
  assertPreparedAsset,
  assetRecordSchema,
  assetRefSchema,
  computeAssetDigest,
  createAssetRef,
  getAssetDigest,
  parseAssetRef,
  prepareAsset,
  type AssetReader,
  type AssetRecord,
  type AssetRef,
  type AssetStat,
  type AssetVerification,
  type PreparedAsset,
  type PrepareAssetOptions,
} from "@brains/assets";
export { EntityService } from "./entityService";
export { RemoteEntityService } from "./remote-entity-service";
export { RemoteProjectionStore } from "./remote-projection-store";
export { EntityRegistry } from "./entityRegistry";
export {
  ENTITY_RPC_SERVICE,
  EntityRpcRequestSchema,
  handleEntityRpcRequest,
  parseEntityRpcCall,
  parseEntityRpcRequest,
  parseEntityRpcResult,
} from "./entity-rpc";
export type { EntityRpcCall } from "./entity-rpc";
export {
  createEntityBulkCoordination,
  durableBulkMutationChildRefSchema,
} from "./entity-bulk-coordination";
export type {
  DurableBulkMutationBatch,
  DurableBulkMutationChildRef,
  EntityBulkCoordination,
} from "./entity-bulk-coordination";
export type {
  EntityIndexReadinessRpcOptions,
  EntityRpcRequest,
  EntityRpcTransport,
} from "./entity-rpc";
export {
  PROJECTION_STORE_RPC_SERVICE,
  ProjectionStoreRpcRequestSchema,
  handleProjectionStoreRpcRequest,
  parseProjectionStoreRpcRequest,
  parseProjectionStoreRpcResult,
} from "./projection-rpc";
export type {
  ProjectionStoreRpcRequest,
  ProjectionStoreRpcTransport,
} from "./projection-rpc";
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
  type IProjectionStore,
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
  GetEntityRawRequest,
  ProjectionOwnedEntityRequest,
  CreateEntityRequest,
  UpdateEntityRequest,
  UpsertEntityRequest,
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
  EntityServiceClient,
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
export { InMemoryDataSourceRegistry } from "./datasource-registry";
export type { DataSourceRegistry } from "./datasource-registry";
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
