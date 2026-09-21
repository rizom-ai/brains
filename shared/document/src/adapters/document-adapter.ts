import type { EntityAdapter } from "@brains/entity-service";
import {
  documentSchema,
  type DocumentEntity,
  type DocumentMetadata,
  type DocumentIngestionStatus,
} from "../schemas/document";
import { assetRefSchema } from "@brains/assets";
import {
  documentAssetFactsSchema,
  type DocumentAssetFacts,
} from "../document-file-asset";

interface DocumentDescription {
  filename: string;
  title?: string;
  status?: DocumentIngestionStatus;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceUploadId?: string;
  sourceFilename?: string;
  sourceMediaType?: string;
  attachmentType?: string;
  dedupKey?: string;
}

export interface CreateDocumentInput extends DocumentDescription {
  facts: DocumentAssetFacts;
}
export interface CreatePendingDocumentInput extends DocumentDescription {
  status?: "pending" | "failed";
}

export class DocumentAdapter implements EntityAdapter<
  DocumentEntity,
  DocumentMetadata
> {
  public readonly entityType = "document" as const;
  public readonly purpose =
    "A durable rendered file artifact such as a printable or carousel PDF.";
  public readonly schema: typeof documentSchema = documentSchema;

  public toMarkdown(entity: DocumentEntity): string {
    return entity.content;
  }

  public fromMarkdown(content: string): Partial<DocumentEntity> {
    // Pending/failed placeholders are empty; the combined entity schema checks
    // their status after sidecar metadata is merged. Inline PDFs are not accepted.
    if (content) assetRefSchema.parse(content);

    return {
      entityType: "document",
      content,
    };
  }

  public extractMetadata(entity: DocumentEntity): DocumentMetadata {
    return entity.metadata;
  }

  public parseFrontMatter<TFrontmatter>(
    _markdown: string,
    schema: { parse(data: unknown): TFrontmatter },
  ): TFrontmatter {
    return schema.parse({});
  }

  public generateFrontMatter(_entity: DocumentEntity): string {
    return "";
  }

  public getBodyTemplate(): string {
    return "";
  }

  public createDocumentEntity(
    input: CreateDocumentInput,
  ): Pick<DocumentEntity, "entityType" | "content" | "metadata"> {
    const { facts: declared, ...metadataInput } = input;
    const facts = documentAssetFactsSchema.parse(declared);
    return {
      entityType: "document",
      content: facts.ref,
      metadata: {
        ...metadataInput,
        mimeType: facts.mimeType,
        sizeBytes: facts.sizeBytes,
        pageCount: facts.pageCount,
        status: input.status ?? "draft",
      },
    };
  }

  public createPendingDocumentEntity(
    input: CreatePendingDocumentInput,
  ): Pick<DocumentEntity, "entityType" | "content" | "metadata"> {
    return {
      entityType: "document",
      content: "",
      metadata: {
        ...input,
        mimeType: "application/pdf",
        status: input.status ?? "pending",
      },
    };
  }
}

export const documentAdapter: DocumentAdapter = new DocumentAdapter();
