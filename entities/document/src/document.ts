import {
  assertStoredDocumentContent,
  documentMetadataSchema,
} from "@brains/document";
import { defineEntity, type EntityDefinition } from "@brains/sdk/entities";
import { documentCreateRouting } from "./create-routes";
import {
  generateDocumentJob,
  type DocumentGenerationHandlerDeps,
} from "./jobs/generate-document";

const DOCUMENT_INSTRUCTIONS =
  "Document entities store durable file artifacts such as PDFs. Uploaded PDFs are raw document files, not decks: preserve them with system_create upload transform preserve. Render PDF artifacts such as carousel or printable with system_generate operation.kind attachment.";

/**
 * A document: a durable file artifact such as a rendered PDF, its bytes kept
 * as a durable asset, its filename, page count and provenance beside them.
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
        // Bytes live in asset rows; the stored reference is not searchable text.
        binaryStorage: "asset",
        fullTextSearchable: false,
        projectionSource: false,
        projectionSourceRole: "excluded",
      },
      // A stored reference, an inline PDF stored before assets, or nothing
      // while pending; the filename, page count, dedup key and provenance
      // arrive beside them.
      markdown: {
        decode: ({ content }) => {
          assertStoredDocumentContent(content);
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
