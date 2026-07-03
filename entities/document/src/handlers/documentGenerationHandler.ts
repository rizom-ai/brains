import { createHash } from "node:crypto";
import type { ServicePluginContext } from "@brains/plugins";
import {
  BaseJobHandler,
  failPendingEntity,
  saveProcessedEntity,
} from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils";
import { getErrorMessage } from "@brains/utils/error";
import { parseMarkdown, updateFrontmatterField } from "@brains/utils/markdown";
import { slugify } from "@brains/utils/string-utils";
import {
  countPdfPages,
  createPdfDataUrl,
  documentAdapter,
  type DocumentEntity,
} from "@brains/document";
import { renderPdf as defaultRenderPdf } from "@brains/media-renderer";
import type { PdfRenderOptions } from "@brains/media-renderer";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGE_COUNT = 20;
const DEFAULT_TIMEOUT_MS = 60_000;
const DOCUMENT_ID_MAX_LENGTH = 80;
const DOCUMENT_ID_HASH_LENGTH = 10;

export const documentGenerationJobSchemaBase = z.object({
  renderUrl: z.string().url().optional(),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  documentId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  dedupKey: z.string().min(1).optional(),
  replace: z.boolean().optional(),
  pageCount: z.number().int().min(0).optional(),
  maxPageCount: z.number().int().positive().optional(),
  maxBytes: z.number().int().positive().optional(),
  timeoutMs: z.number().int().positive().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  format: z.string().optional(),
  targetEntityType: z.string().min(1).optional(),
  targetEntityId: z.string().min(1).optional(),
});

export const documentGenerationJobSchema =
  documentGenerationJobSchemaBase.refine(
    (data) =>
      (data.targetEntityType === undefined &&
        data.targetEntityId === undefined) ||
      (data.targetEntityType !== undefined &&
        data.targetEntityId !== undefined),
    {
      message: "targetEntityType and targetEntityId must be provided together",
      path: ["targetEntityId"],
    },
  );

export type DocumentGenerationJobData = z.infer<
  typeof documentGenerationJobSchema
>;

export interface DocumentGenerationResult {
  success: true;
  documentId: string;
  reused: boolean;
}

export type RenderPdf = (
  url: string,
  options?: PdfRenderOptions,
) => Promise<Buffer>;

export interface DocumentGenerationHandlerDeps {
  renderPdf?: RenderPdf;
}

export class DocumentGenerationJobHandler extends BaseJobHandler<
  "generate",
  DocumentGenerationJobData,
  DocumentGenerationResult
> {
  private readonly renderPdf: RenderPdf;

  constructor(
    logger: Logger,
    private readonly context: Pick<
      ServicePluginContext,
      "entityService" | "attachments"
    >,
    deps: DocumentGenerationHandlerDeps = {},
  ) {
    super(logger, {
      schema: documentGenerationJobSchema,
      jobTypeName: "document-generate",
    });
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
  }

  /**
   * Computes the dedup key for a generation job.
   *
   * - An explicitly-provided `dedupKey` always wins (callers/tests that pin a
   *   stable identity).
   * - The `renderUrl` (preview) path keys on the URL.
   * - The attachment-derived path keys on the source entity's identity AND its
   *   current content hash, so editing the source re-renders rather than
   *   reusing a stale document. If the source entity (or its hash) can't be
   *   found, we fall back to the identity-only key.
   *
   * The key intentionally covers only the source content; theme-mode and brand
   * are out of scope and are not expected to change at runtime.
   */
  private async getDedupKey(data: DocumentGenerationJobData): Promise<string> {
    if (data.dedupKey !== undefined) {
      return data.dedupKey;
    }
    if (data.renderUrl !== undefined) {
      return `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl}`;
    }
    const base = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:resolved-attachment`;
    const source = await this.context.entityService.getEntity({
      entityType: data.sourceEntityType,
      id: data.sourceEntityId,
    });
    return source ? `${base}:${source.contentHash}` : base;
  }

  async process(
    data: DocumentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<DocumentGenerationResult> {
    this.logger.debug("Starting document generation job", {
      jobId,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      attachmentType: data.attachmentType,
    });

    const maxPageCount = data.maxPageCount ?? DEFAULT_MAX_PAGE_COUNT;
    const maxBytes = data.maxBytes ?? DEFAULT_MAX_BYTES;
    const timeoutMs = data.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    if (data.pageCount !== undefined && data.pageCount > maxPageCount) {
      throw new Error(
        `Refusing to render ${data.pageCount} page PDF; maxPageCount=${maxPageCount}`,
      );
    }

    const dedupKey = await this.getDedupKey(data);
    const documentId = getDocumentId(data, dedupKey);
    const hasRequestedDocumentIdentity =
      data.documentId !== undefined || data.filename !== undefined;
    if (data.replace !== true) {
      const existing = await this.findDocumentByDedupKey(
        dedupKey,
        hasRequestedDocumentIdentity ? documentId : undefined,
      );
      if (
        existing &&
        (!hasRequestedDocumentIdentity || existing.id === documentId)
      ) {
        if (data.targetEntityType && data.targetEntityId) {
          await this.attachDocumentToTarget(
            data.targetEntityType,
            data.targetEntityId,
            existing.id,
            data,
          );
        }
        await this.reportProgress(progressReporter, {
          progress: 100,
          message: "Reusing existing generated document",
        });
        return { success: true, documentId: existing.id, reused: true };
      }
    }

    await this.reportProgress(progressReporter, {
      progress: 20,
      message: "Rendering PDF document",
    });

    try {
      const attachment = await this.resolveDocumentAttachment(
        data,
        documentId,
        {
          timeoutMs,
          maxBytes,
        },
      );
      const pdf = attachment.data;
      if (pdf.byteLength > maxBytes) {
        throw new Error(
          `Rendered PDF exceeds maxBytes=${maxBytes}: ${pdf.byteLength} bytes`,
        );
      }

      const measuredPageCount = countPdfPages(pdf);
      if (measuredPageCount > maxPageCount) {
        throw new Error(
          `Rendered PDF has ${measuredPageCount} pages, exceeding maxPageCount=${maxPageCount}`,
        );
      }
      const pageCount =
        measuredPageCount > 0 ? measuredPageCount : data.pageCount;

      await this.reportProgress(progressReporter, {
        progress: 70,
        message: "Storing PDF document",
      });

      const filename =
        data.filename ??
        (data.renderUrl === undefined
          ? attachment.filename
          : `${documentId}.pdf`);
      const entityData = documentAdapter.createDocumentEntity({
        dataUrl: createPdfDataUrl(pdf),
        filename,
        ...(data.title && { title: data.title }),
        ...(pageCount !== undefined && { pageCount }),
        status: "draft",
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
        dedupKey,
      });

      await saveProcessedEntity({
        entityService: this.context.entityService,
        entity: {
          ...entityData,
          id: documentId,
        },
      });

      if (data.targetEntityType && data.targetEntityId) {
        await this.attachDocumentToTarget(
          data.targetEntityType,
          data.targetEntityId,
          documentId,
          data,
        );
      }

      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "PDF document generation complete",
      });

      return { success: true, documentId, reused: false };
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      this.logger.error("Document generation failed", {
        jobId,
        error: errorMessage,
      });
      await failPendingEntity({
        entityService: this.context.entityService,
        entityType: "document",
        id: documentId,
        error: errorMessage,
      });
      throw error;
    }
  }

  private async resolveDocumentAttachment(
    data: DocumentGenerationJobData,
    documentId: string,
    limits: { timeoutMs: number; maxBytes: number },
  ): Promise<PublishMediaData> {
    if (data.renderUrl !== undefined) {
      return {
        type: "document",
        data: await this.renderPdf(data.renderUrl, {
          timeoutMs: limits.timeoutMs,
          maxBytes: limits.maxBytes,
          printBackground: true,
          preferCSSPageSize: true,
          ...(data.width !== undefined && { width: data.width }),
          ...(data.height !== undefined && { height: data.height }),
          ...(data.format !== undefined && { format: data.format }),
        }),
        mimeType: "application/pdf",
        filename: data.filename ?? `${documentId}.pdf`,
      };
    }

    const attachment = await this.context.attachments.resolve({
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      attachmentType: data.attachmentType,
    });
    if (!attachment) {
      throw new Error(
        `No attachment provider found for ${data.sourceEntityType}/${data.attachmentType}`,
      );
    }
    if (attachment.type !== "document") {
      throw new Error(
        `Attachment provider returned ${attachment.type}; expected document`,
      );
    }
    return attachment;
  }

  private async findDocumentByDedupKey(
    dedupKey: string,
    preferredDocumentId?: string,
  ): Promise<DocumentEntity | undefined> {
    const documents =
      await this.context.entityService.listEntities<DocumentEntity>({
        entityType: "document",
        options: { filter: { metadata: { dedupKey } } },
      });
    if (documents.length > 1) {
      this.logger.warn("Multiple documents share dedupKey; using first", {
        dedupKey,
        count: documents.length,
        ids: documents.map((d) => d.id),
        preferredDocumentId,
      });
    }
    const reusableDocuments = documents.filter(
      (document) =>
        document.metadata.status !== "pending" &&
        document.metadata.status !== "failed",
    );
    return (
      reusableDocuments.find(
        (document) => document.id === preferredDocumentId,
      ) ?? reusableDocuments[0]
    );
  }

  private async attachDocumentToTarget(
    entityType: string,
    entityId: string,
    documentId: string,
    data: DocumentGenerationJobData,
  ): Promise<void> {
    const target = await this.context.entityService.getEntity({
      entityType,
      id: entityId,
    });
    if (!target) {
      throw new Error(`Target entity not found: ${entityType}/${entityId}`);
    }

    const { frontmatter } = parseMarkdown(target.content);
    const existingDocuments = Array.isArray(frontmatter["documents"])
      ? frontmatter["documents"].filter(isDocumentReference)
      : [];

    const activeDocuments = data.replace
      ? await this.removeReferencesForSameSourceAttachment(
          existingDocuments,
          documentId,
          data,
        )
      : existingDocuments;

    const documents = activeDocuments.some((item) => item.id === documentId)
      ? activeDocuments
      : [...activeDocuments, { id: documentId }];

    await this.context.entityService.updateEntity({
      entity: {
        ...target,
        content: updateFrontmatterField(target.content, "documents", documents),
      },
    });
  }

  private async removeReferencesForSameSourceAttachment(
    references: Array<{ id: string }>,
    documentId: string,
    data: DocumentGenerationJobData,
  ): Promise<Array<{ id: string }>> {
    const filtered: Array<{ id: string }> = [];
    for (const reference of references) {
      if (reference.id === documentId) {
        filtered.push(reference);
        continue;
      }

      const document =
        await this.context.entityService.getEntity<DocumentEntity>({
          entityType: "document",
          id: reference.id,
        });
      if (!document || !isSameSourceAttachment(document, data)) {
        filtered.push(reference);
      }
    }
    return filtered;
  }
}

export function getDocumentId(
  data: DocumentGenerationJobData,
  dedupKey?: string,
): string {
  // Fall back to the dedup key (not the jobId) so a generation that reuses an
  // existing document resolves to the same id the caller computed up front —
  // otherwise the attachment URL would point at an id that was never created.
  //
  // Enqueue-side callers (the system_generate create interceptor
  // tool) can't await the content-hashed dedup key, so they omit it; they
  // always supply an explicit documentId/filename, falling through to the
  // identity-only key only as a last resort. The job handler passes the real
  // content-hashed dedup key so a reuse resolves to the same id.
  const identityKey = `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl ?? "resolved-attachment"}`;
  const base =
    data.documentId ??
    data.filename?.replace(/\.pdf$/i, "") ??
    dedupKey ??
    identityKey;
  const idBase =
    data.replace === true && data.documentId === undefined
      ? `${base}-${Date.now()}`
      : base;
  return normalizeDocumentId(idBase);
}

function normalizeDocumentId(base: string): string {
  const slug =
    slugify(base.replace(/[/:]+/g, " ")) || `document-${shortHash(base)}`;
  if (slug.length <= DOCUMENT_ID_MAX_LENGTH) return slug;

  const suffix = `-${shortHash(base)}`;
  const prefix = slug
    .slice(0, DOCUMENT_ID_MAX_LENGTH - suffix.length)
    .replace(/-+$/g, "");
  return `${prefix}${suffix}`;
}

function shortHash(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, DOCUMENT_ID_HASH_LENGTH);
}

function isDocumentReference(value: unknown): value is { id: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    value.id.length > 0
  );
}

function isSameSourceAttachment(
  document: DocumentEntity,
  data: DocumentGenerationJobData,
): boolean {
  return (
    document.metadata.sourceEntityType === data.sourceEntityType &&
    document.metadata.sourceEntityId === data.sourceEntityId &&
    document.metadata.attachmentType === data.attachmentType
  );
}
