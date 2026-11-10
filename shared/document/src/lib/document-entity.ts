import type {
  DocumentEntity,
  DocumentIngestionStatus,
} from "../schemas/document";
import { parseDocumentDataUrl } from "./document-utils";

export interface CreateDocumentInput {
  dataUrl: string;
  filename: string;
  title?: string;
  pageCount?: number;
  status?: DocumentIngestionStatus;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  attachmentType?: string;
  dedupKey?: string;
}

/**
 * A document's data from its PDF data URL and what is known beside it:
 * the media type is read from the data URL, which must be a PDF.
 */
export function createDocumentEntity(
  input: CreateDocumentInput,
): Pick<DocumentEntity, "entityType" | "content" | "metadata"> {
  const { dataUrl, ...metadataInput } = input;
  const { mimeType } = parseDocumentDataUrl(dataUrl);

  return {
    entityType: "document",
    content: dataUrl,
    metadata: {
      mimeType,
      ...metadataInput,
    },
  };
}
