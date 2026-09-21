export { DocumentPlugin, documentPlugin } from "./plugin";
export {
  DocumentGenerationJobHandler,
  documentGenerationJobSchema,
  documentGenerationJobSchemaBase,
  type DocumentGenerationHandlerDeps,
  type DocumentGenerationJobData,
  type DocumentGenerationResult,
} from "./handlers/documentGenerationHandler";
export {
  DocumentAdapter,
  documentAdapter,
  documentMimeTypeSchema,
  documentMetadataSchema,
  documentSchema,
  type CreateDocumentInput,
  type CreatePendingDocumentInput,
  type DocumentEntity,
  type DocumentMetadata,
  type DocumentMimeType,
} from "@brains/document";
