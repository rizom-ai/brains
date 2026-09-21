import { createHash } from "node:crypto";
import type {
  ServicePluginContext,
  AttachmentFile,
  AttachmentFileConsumer,
} from "@brains/plugins";
import {
  BaseJobHandler,
  failPendingEntity,
  saveProcessedEntity,
} from "@brains/plugins";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { parseMarkdown, updateFrontmatterField } from "@brains/utils/markdown";
import type { ProgressReporter } from "@brains/utils/progress";
import { slugify } from "@brains/utils/string-utils";
import { z } from "@brains/utils/zod";
import {
  documentAssetFactsFromInspection,
  assertDocumentFileMatches,
  documentAdapter,
  documentSchema,
  type DocumentEntity,
} from "@brains/document";
import { withPreviewPdfFile } from "@brains/media-page-composer";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGE_COUNT = 20;
const DEFAULT_TIMEOUT_MS = 60_000;
const DOCUMENT_ID_MAX_LENGTH = 80;
const DOCUMENT_ID_HASH_LENGTH = 10;

const documentGenerationJobSchemaShape: {
  renderUrl: z.ZodOptional<z.ZodURL>;
  sourceEntityType: z.ZodString;
  sourceEntityId: z.ZodString;
  attachmentType: z.ZodString;
  documentId: z.ZodOptional<z.ZodString>;
  title: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  dedupKey: z.ZodOptional<z.ZodString>;
  replace: z.ZodOptional<z.ZodBoolean>;
  pageCount: z.ZodOptional<z.ZodNumber>;
  maxPageCount: z.ZodOptional<z.ZodNumber>;
  maxBytes: z.ZodOptional<z.ZodNumber>;
  timeoutMs: z.ZodOptional<z.ZodNumber>;
  width: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
  height: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodNumber]>>;
  format: z.ZodOptional<z.ZodString>;
  targetEntityType: z.ZodOptional<z.ZodString>;
  targetEntityId: z.ZodOptional<z.ZodString>;
} = {
  renderUrl: z.url().optional(),
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
  maxBytes: z.number().int().positive().max(MAX_ASSET_BYTES).optional(),
  timeoutMs: z.number().int().positive().optional(),
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
  format: z.string().optional(),
  targetEntityType: z.string().min(1).optional(),
  targetEntityId: z.string().min(1).optional(),
};

export const documentGenerationJobSchemaBase: z.ZodObject<
  typeof documentGenerationJobSchemaShape
> = z.object(documentGenerationJobSchemaShape);

export type DocumentGenerationJobDataBase = z.output<
  typeof documentGenerationJobSchemaBase
>;

export const documentGenerationJobSchema: z.ZodType<DocumentGenerationJobDataBase> =
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

export type DocumentGenerationJobData = z.output<
  typeof documentGenerationJobSchema
>;

export interface DocumentGenerationResult {
  success: true;
  documentId: string;
  reused: boolean;
  warning?: string;
}

export interface DocumentGenerationHandlerDeps {
  withPreviewPdfFile?: typeof withPreviewPdfFile;
}

export class DocumentGenerationJobHandler extends BaseJobHandler<
  "generate",
  DocumentGenerationJobData,
  DocumentGenerationResult
> {
  private readonly context: Pick<
    ServicePluginContext,
    "entityService" | "attachments" | "jobs"
  >;
  private readonly withPreviewPdf: typeof withPreviewPdfFile;

  constructor(
    logger: Logger,
    context: Pick<
      ServicePluginContext,
      "entityService" | "attachments" | "jobs"
    >,
    deps: DocumentGenerationHandlerDeps = {},
  ) {
    super(logger, {
      schema: documentGenerationJobSchema,
      jobTypeName: "document-generate",
    });
    this.context = context;
    this.withPreviewPdf = deps.withPreviewPdfFile ?? withPreviewPdfFile;
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
    signal: AbortSignal,
  ): Promise<DocumentGenerationResult> {
    signal.throwIfAborted();
    const attempt = await this.context.jobs.getStatus(jobId);
    signal.throwIfAborted();
    if (attempt && attempt.retryCount > 0)
      throw new Error(
        "Document generation cannot be automatically replayed; create a new request",
      );
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
    signal.throwIfAborted();
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
          const attached = await this.attachDocumentToTarget(
            data.targetEntityType,
            data.targetEntityId,
            existing.id,
            data,
            signal,
          );
          if (!attached)
            return {
              success: true,
              documentId: existing.id,
              reused: true,
              warning: "Document reused; target update cancelled",
            };
        }
        if (!signal.aborted)
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

    const state: { publicationEntered: boolean; borrowedSignal?: AbortSignal } =
      {
        publicationEntered: false,
      };
    try {
      const files = this.context.entityService.fileAssets;
      if (!files)
        throw new Error("Document file publication is not provisioned");
      return await this.withDocumentAttachment(
        data,
        documentId,
        { timeoutMs, maxBytes },
        async (
          attachment,
          transferSignal,
        ): Promise<DocumentGenerationResult> => {
          state.borrowedSignal = transferSignal;
          transferSignal.throwIfAborted();
          if (attachment.type !== "document")
            throw new Error(
              `Attachment provider returned ${attachment.type}; expected document`,
            );
          const inspection = await files.inspect(attachment.source, {
            inspector: "pdf",
            signal: transferSignal,
          });
          transferSignal.throwIfAborted();
          const facts = documentAssetFactsFromInspection(inspection, {
            maxBytes,
            maxPageCount,
          });
          assertDocumentFileMatches(facts, {
            sizeBytes: attachment.source.sizeBytes,
            sha256: attachment.sha256,
            mimeType: attachment.mimeType,
          });

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
            facts,
            filename,
            ...(data.title && { title: data.title }),
            status: "draft",
            sourceEntityType: data.sourceEntityType,
            sourceEntityId: data.sourceEntityId,
            attachmentType: data.attachmentType,
            dedupKey,
          });

          // A save can commit without returning its acknowledgement. Once entered,
          // neither reply uncertainty nor target/progress failure permits a second
          // mutation marking this document failed.
          transferSignal.throwIfAborted();
          state.publicationEntered = true;
          await saveProcessedEntity({
            entityService: this.context.entityService,
            entity: {
              ...entityData,
              id: documentId,
            },
            fileAsset: attachment.source,
            signal: transferSignal,
          });

          if (data.targetEntityType && data.targetEntityId) {
            const attached = await this.attachDocumentToTarget(
              data.targetEntityType,
              data.targetEntityId,
              documentId,
              data,
              transferSignal,
            );
            if (!attached)
              return {
                success: true,
                documentId,
                reused: false,
                warning: "Document saved; target update cancelled",
              };
          }

          if (!transferSignal.aborted)
            await this.reportProgress(progressReporter, {
              progress: 100,
              message: "PDF document generation complete",
            });

          return { success: true, documentId, reused: false };
        },
        signal,
      );
    } catch (error) {
      if (signal.aborted || state.borrowedSignal?.aborted) throw error;
      const errorMessage = getErrorMessage(error);
      this.logger.error("Document generation failed", {
        jobId,
        error,
      });
      const failures: unknown[] = [];
      if (!state.publicationEntered) {
        try {
          await failPendingEntity({
            entityService: this.context.entityService,
            entityType: "document",
            id: documentId,
            error: errorMessage,
          });
        } catch (failure) {
          if (!Object.is(failure, error)) failures.push(failure);
        }
      }
      if (failures.length > 0)
        throw new AggregateError(
          [error, ...failures],
          "Document rendering and pending failure update failed",
          { cause: error },
        );
      throw error;
    }
  }

  private async withDocumentAttachment(
    data: DocumentGenerationJobData,
    documentId: string,
    limits: { timeoutMs: number; maxBytes: number },
    use: AttachmentFileConsumer<DocumentGenerationResult>,
    signal: AbortSignal,
  ): Promise<DocumentGenerationResult> {
    signal.throwIfAborted();
    if (data.renderUrl !== undefined) {
      const files = this.context.entityService.fileAssets;
      if (!files)
        throw new Error("Preview PDF file rendering is not provisioned");
      return this.withPreviewPdf(
        {
          url: data.renderUrl,
          ...limits,
          ...(data.width !== undefined && { width: data.width }),
          ...(data.height !== undefined && { height: data.height }),
          ...(data.format !== undefined && { format: data.format }),
        },
        files,
        (file, ownedSignal) => {
          const attachment: AttachmentFile = {
            type: "document",
            mimeType: "application/pdf",
            source: { sourceFile: file.sourceFile, sizeBytes: file.sizeBytes },
            sha256: file.sha256,
            filename: data.filename ?? `${documentId}.pdf`,
          };
          return use(attachment, ownedSignal);
        },
        { signal },
      );
    }
    const result = await this.context.attachments.withFile(
      {
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
      },
      use,
      { signal },
    );
    if (result === undefined)
      throw new Error(
        `No attachment provider found for ${data.sourceEntityType}/${data.attachmentType}`,
      );
    return result;
  }

  private async findDocumentByDedupKey(
    dedupKey: string,
    preferredDocumentId?: string,
  ): Promise<DocumentEntity | undefined> {
    const documents = await this.context.entityService.listEntities(
      {
        entityType: "document",
        options: { filter: { metadata: { dedupKey } } },
      },
      documentSchema,
    );
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
    signal: AbortSignal,
  ): Promise<boolean> {
    const cancelled = (): boolean => signal.aborted;
    if (cancelled()) return false;
    const target = await this.context.entityService.getEntity({
      entityType,
      id: entityId,
    });
    if (!target) {
      throw new Error(`Target entity not found: ${entityType}/${entityId}`);
    }

    if (cancelled()) return false;
    const { frontmatter } = parseMarkdown(target.content);
    const existingDocuments = Array.isArray(frontmatter["documents"])
      ? frontmatter["documents"].filter(isDocumentReference)
      : [];

    const activeDocuments = data.replace
      ? await this.removeReferencesForSameSourceAttachment(
          existingDocuments,
          documentId,
          data,
          signal,
        )
      : existingDocuments;

    const documents = activeDocuments.some((item) => item.id === documentId)
      ? activeDocuments
      : [...activeDocuments, { id: documentId }];

    if (cancelled()) return false;
    await this.context.entityService.updateEntity({
      entity: {
        ...target,
        content: updateFrontmatterField(target.content, "documents", documents),
      },
    });
    return true;
  }

  private async removeReferencesForSameSourceAttachment(
    references: Array<{ id: string }>,
    documentId: string,
    data: DocumentGenerationJobData,
    signal: AbortSignal,
  ): Promise<Array<{ id: string }>> {
    const filtered: Array<{ id: string }> = [];
    for (const reference of references) {
      if (signal.aborted) return references;
      if (reference.id === documentId) {
        filtered.push(reference);
        continue;
      }

      const document = await this.context.entityService.getEntity(
        {
          entityType: "document",
          id: reference.id,
        },
        documentSchema,
      );
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
