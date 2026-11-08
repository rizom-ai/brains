import {
  defineEntityPackage,
  z,
  type EntityPackageDefinition,
} from "@brains/sdk/entities";
import { documentEntity } from "./document";
import type { DocumentGenerationHandlerDeps } from "./jobs/generate-document";

const document: ReturnType<typeof documentEntity> = documentEntity();

/** The document plugin took any config and kept none; a brain config naming some stays valid. */
const documentConfigSchema: z.ZodObject<
  Record<never, never>,
  z.core.$loose
> = z.looseObject({});

/**
 * Documents, built with the job's PDF renderer; the default renders with
 * the brain's media renderer.
 */
export function createDocumentPackage(
  deps: DocumentGenerationHandlerDeps = {},
): EntityPackageDefinition<
  readonly [typeof document],
  readonly [],
  typeof documentConfigSchema
> {
  return defineEntityPackage({
    id: "document",
    config: documentConfigSchema,
    entities: [deps.renderPdf ? documentEntity(deps) : document],
  });
}

/** Documents: rendered PDFs and uploaded ones, kept as their bytes. */
export const documentPackage: ReturnType<typeof createDocumentPackage> =
  createDocumentPackage();

export default documentPackage;

export { documentEntity } from "./document";
export {
  documentGenerationJobContract,
  documentGenerationJobSchema,
  documentGenerationJobSchemaBase,
  getDocumentId,
  type DocumentGenerationHandlerDeps,
  type DocumentGenerationJobData,
  type DocumentGenerationResult,
  type RenderPdf,
} from "./jobs/generate-document";
export {
  createDocumentEntity,
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
