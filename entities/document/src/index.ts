export { DocumentPlugin, documentPlugin } from "./plugin";
export {
  DocumentGenerationJobHandler,
  documentGenerationJobSchema,
  documentGenerationJobSchemaBase,
  type DocumentGenerationHandlerDeps,
  type DocumentGenerationJobData,
  type DocumentGenerationResult,
  type RenderPdf,
} from "./handlers/documentGenerationHandler";
export { createDocumentTools, type DocumentGenerateInput } from "./tools";
export {
  DocumentAdapter,
  documentAdapter,
  documentMimeTypeSchema,
  documentMetadataSchema,
  documentSchema,
  createPdfDataUrl,
  isPdfDataUrl,
  parseDocumentDataUrl,
  type CreateDocumentInput,
  type DocumentEntity,
  type DocumentMetadata,
  type DocumentMimeType,
  type ParsedDocumentDataUrl,
} from "@brains/document";
