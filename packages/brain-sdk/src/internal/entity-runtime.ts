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
  withUrlRoute,
  writesInDocumentOrder,
  withFrontmatterSchema,
  afterGeneration,
  loggedProvider,
  type AnyEntityReads,
  type EntityAnswerContext,
  type EntityAnswerDeclaration,
  type EntityRuntime,
  type EntityRuntimeAttachments,
  type EntityRuntimeIdentity,
  type EntityRuntimeImages,
  type OrdinaryCreateDocument,
  type OrdinaryCreateOptions,
  type QueuedCreate,
  type GenerationOutcome,
  type GenerationOutcomeContext,
  type EntityCreateCaller,
  type EvalGenerationOptions,
  type EvalGenerationProgress,
  type EvalGenerationResult,
  type QueuedAttribution,
  type QueuedPlaceholder,
  type StoredCreate,
} from "@brains/plugins";
export {
  checkEntityText,
  entityTextError,
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
  type BaseEntity,
  type ResolvedRuntimeUpload,
} from "@brains/plugins";
