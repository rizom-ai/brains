/**
 * Internal, first-party only: runtime capabilities a first-party entity
 * definition reaches from the callback context it was handed, through
 * `entityRuntime(context)`, the entity-text helpers its create routes
 * read a writer's text with, and the stored record, its parser schema, the
 * markdown frontmatter codec and the validation error its codecs and
 * imports read and write it with. No public entry exports this module; the
 * public context types never name what it reaches.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-entity-runtime).
 */

export {
  answering,
  contractJob,
  entityAnswer,
  ensureUniqueTitle,
  entityRuntime,
  uniqueTitleContext,
  restatingMetadata,
  withBodyTemplate,
  withFolderTitles,
  withDisplayTitle,
  withPersistValidator,
  withPublishedStatuses,
  withUrlRoute,
  writesInDocumentOrder,
  storedDocumentCodec,
  slugStatingFrontmatter,
  slugStatingMetadata,
  bodyUnderHeader,
  type StoredDocument,
  withFrontmatterSchema,
  afterGeneration,
  loggedProvider,
  type AnyEntityReads,
  type EntityRuntime,
  type EntityCreateCaller,
  type QueuedPlaceholder,
} from "@brains/plugins";
export {
  checkEntityText,
  entityTextError,
  entityTextRefusal,
  readEntityText,
  statedDateSchema,
  uploadTitle,
  type EntityTextResult,
} from "@brains/plugins";
export {
  EntityValidationError,
  baseEntityParserSchema,
  generateMarkdownWithFrontmatter,
  isTextUploadMediaType,
  parseMarkdownWithFrontmatter,
  parseTypedFrontmatter,
  type BaseEntity,
  type ResolvedRuntimeUpload,
} from "@brains/plugins";
export {
  baseEntitySchema,
  canWriteVisibility,
  decodeEntityIdPath,
  encodeEntityIdPath,
  entityIdPathSchema,
  entityTypeClassificationSchema,
  findEntityByIdentifier,
  getPublishBoundaryState,
  isEntityValidationError,
  preserveSourceFrontmatter,
  EntityWriteConflictError,
  type EntityIdPath,
  type EntityIdPathInput,
  type EntitySchema,
  type GetEntityRequest,
} from "@brains/plugins";
export {
  GROUPING_MAX_PAGE_LIMIT,
  GROUPING_PAGE_LIMIT,
  entityGroupingSchema,
  groupingKeySchema,
  groupingSearchSchema,
  groupingSortSchema,
  groupingValueSchema,
  isGroupingContributor,
  queryGroupingUsageSchema,
  type EntityGrouping,
  type EntityGroupingUsage,
} from "@brains/plugins";
