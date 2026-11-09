import { documentMetadataSchema, parseDocumentDataUrl } from "@brains/document";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { documentCreateRouting } from "./create-routes";
import {
  generateDocumentJob,
  type DocumentGenerationHandlerDeps,
} from "./jobs/generate-document";

const DOCUMENT_INSTRUCTIONS =
  "Document entities store durable file artifacts such as PDFs. Uploaded PDFs are raw document files, not decks: preserve them with system_create upload transform preserve. Render PDF artifacts such as carousel or printable with system_generate operation.kind attachment.";

/**
 * A document: a durable file artifact such as a rendered PDF, its bytes as
 * a data URL, its filename, page count and provenance beside them.
 */
export function documentEntity(
  deps: DocumentGenerationHandlerDeps = {},
): EntityDefinition<"document", typeof documentMetadataSchema> {
  const document: EntityDefinition<"document", typeof documentMetadataSchema> =
    defineEntity({
      type: "document",
      purpose:
        "A durable rendered file artifact such as a printable or carousel PDF.",
      metadata: documentMetadataSchema,
      config: {
        embeddable: false,
        binaryStorage: "data-url",
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
      // The bytes are checked to be a PDF; the filename, page count, dedup key
      // and provenance arrive beside them.
      markdown: {
        decode: ({ content }) => {
          parseDocumentDataUrl(content);
          return { content, metadata: {} };
        },
      },
      instructions: DOCUMENT_INSTRUCTIONS,
      create: documentCreateRouting,
      // The job writes the type it is declared on, once it is defined.
      jobs: { generate: generateDocumentJob(() => document, deps) },
    });
  return document;
}
