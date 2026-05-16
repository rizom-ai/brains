import type { EntityAdapter } from "@brains/entity-service";
import type { z } from "@brains/utils";
import {
  documentSchema,
  type DocumentEntity,
  type DocumentMetadata,
} from "../schemas/document";
import { parseDocumentDataUrl } from "../lib/document-utils";

export interface CreateDocumentInput {
  dataUrl: string;
  filename: string;
  title?: string;
  pageCount?: number;
  sourceEntityType?: string;
  sourceEntityId?: string;
  sourceTemplate?: string;
  dedupKey?: string;
}

export class DocumentAdapter implements EntityAdapter<
  DocumentEntity,
  DocumentMetadata
> {
  public readonly entityType = "document" as const;
  public readonly schema = documentSchema;

  public toMarkdown(entity: DocumentEntity): string {
    return entity.content;
  }

  public fromMarkdown(content: string): Partial<DocumentEntity> {
    // Validates the data URL shape; metadata (filename, mimeType, pageCount,
    // dedupKey, source provenance) is supplied by directory-sync via the
    // sidecar JSON / path-derived defaults and merged in by the import
    // pipeline. The adapter cannot synthesize a valid filename on its own.
    parseDocumentDataUrl(content);

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
    schema: z.ZodSchema<TFrontmatter>,
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
}

export const documentAdapter = new DocumentAdapter();
