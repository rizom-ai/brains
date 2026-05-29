import type { ServicePluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { PublishMediaData } from "@brains/contracts";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  getErrorMessage,
  parseMarkdown,
  slugify,
  updateFrontmatterField,
  z,
} from "@brains/utils";
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

export const documentGenerationJobSchemaBase = z.object({
  renderUrl: z.string().url().optional(),
  sourceEntityType: z.string().min(1),
  sourceEntityId: z.string().min(1),
  attachmentType: z.string().min(1),
  documentId: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  dedupKey: z.string().min(1).optional(),
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

    const dedupKey = getDedupKey(data);
    const existing = await this.findDocumentByDedupKey(dedupKey);
    if (existing) {
      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "Reusing existing generated document",
      });
      return { success: true, documentId: existing.id, reused: true };
    }

    await this.reportProgress(progressReporter, {
      progress: 20,
      message: "Rendering PDF document",
    });

    try {
      const attachment = await this.resolveDocumentAttachment(data, {
        timeoutMs,
        maxBytes,
      });
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

      const documentId = getDocumentId(data, jobId);
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
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        attachmentType: data.attachmentType,
        dedupKey,
      });

      const current = await this.context.entityService.getEntity({
        entityType: "document",
        id: documentId,
      });
      if (current) {
        await this.context.entityService.deleteEntity({
          entityType: "document",
          id: documentId,
        });
      }

      await this.context.entityService.createEntity({
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
        );
      }

      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "PDF document generation complete",
      });

      return { success: true, documentId, reused: false };
    } catch (error) {
      this.logger.error("Document generation failed", {
        jobId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private async resolveDocumentAttachment(
    data: DocumentGenerationJobData,
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
        filename: data.filename ?? `${getDocumentId(data, "document")}.pdf`,
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
    return attachment;
  }

  private async findDocumentByDedupKey(
    dedupKey: string,
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
      });
    }
    return documents[0];
  }

  private async attachDocumentToTarget(
    entityType: string,
    entityId: string,
    documentId: string,
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

    const documents = existingDocuments.some((item) => item.id === documentId)
      ? existingDocuments
      : [...existingDocuments, { id: documentId }];

    await this.context.entityService.updateEntity({
      entity: {
        ...target,
        content: updateFrontmatterField(target.content, "documents", documents),
      },
    });
  }
}

function getDedupKey(data: DocumentGenerationJobData): string {
  return (
    data.dedupKey ??
    `${data.attachmentType}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl ?? "resolved-attachment"}`
  );
}

export function getDocumentId(
  data: DocumentGenerationJobData,
  jobId: string,
): string {
  const base =
    data.documentId ??
    data.filename?.replace(/\.pdf$/i, "") ??
    `${data.attachmentType}-${data.sourceEntityType}-${data.sourceEntityId}-${jobId}`;
  return slugify(base);
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
