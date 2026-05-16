import type { ServicePluginContext } from "@brains/plugins";
import { BaseJobHandler } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import {
  getErrorMessage,
  parseMarkdown,
  slugify,
  updateFrontmatterField,
  z,
} from "@brains/utils";
import {
  createPdfDataUrl,
  documentAdapter,
  type DocumentEntity,
} from "@brains/document";
import { renderPdf as defaultRenderPdf } from "@brains/media-renderer";
import type { PdfRenderOptions } from "@brains/media-renderer";

const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_PAGE_COUNT = 20;
const DEFAULT_TIMEOUT_MS = 60_000;

export const mediaDocumentGenerationJobSchema = z
  .object({
    renderUrl: z.string().url(),
    sourceEntityType: z.string().min(1),
    sourceEntityId: z.string().min(1),
    sourceTemplate: z.string().min(1),
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
  })
  .refine(
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

export type MediaDocumentGenerationJobData = z.infer<
  typeof mediaDocumentGenerationJobSchema
>;

export interface MediaDocumentGenerationResult {
  success: true;
  documentId: string;
  reused: boolean;
}

type RenderPdf = (url: string, options?: PdfRenderOptions) => Promise<Buffer>;

export interface MediaDocumentGenerationHandlerDeps {
  renderPdf?: RenderPdf;
}

export class MediaDocumentGenerationJobHandler extends BaseJobHandler<
  "media-document-generate",
  MediaDocumentGenerationJobData,
  MediaDocumentGenerationResult
> {
  private readonly renderPdf: RenderPdf;

  constructor(
    logger: Logger,
    private readonly context: Pick<ServicePluginContext, "entityService">,
    deps: MediaDocumentGenerationHandlerDeps = {},
  ) {
    super(logger, {
      schema: mediaDocumentGenerationJobSchema,
      jobTypeName: "media-document-generate",
    });
    this.renderPdf = deps.renderPdf ?? defaultRenderPdf;
  }

  async process(
    data: MediaDocumentGenerationJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<MediaDocumentGenerationResult> {
    this.logger.debug("Starting media document generation job", {
      jobId,
      sourceEntityType: data.sourceEntityType,
      sourceEntityId: data.sourceEntityId,
      sourceTemplate: data.sourceTemplate,
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
      const pdf = await this.renderPdf(data.renderUrl, {
        timeoutMs,
        maxBytes,
        printBackground: true,
        preferCSSPageSize: true,
        ...(data.width !== undefined && { width: data.width }),
        ...(data.height !== undefined && { height: data.height }),
        ...(data.format !== undefined && { format: data.format }),
      });

      await this.reportProgress(progressReporter, {
        progress: 70,
        message: "Storing PDF document",
      });

      const documentId = getDocumentId(data, jobId);
      const filename = data.filename ?? `${documentId}.pdf`;
      const entityData = documentAdapter.createDocumentEntity({
        dataUrl: createPdfDataUrl(pdf),
        filename,
        ...(data.title && { title: data.title }),
        ...(data.pageCount !== undefined && { pageCount: data.pageCount }),
        sourceEntityType: data.sourceEntityType,
        sourceEntityId: data.sourceEntityId,
        sourceTemplate: data.sourceTemplate,
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
      this.logger.error("Media document generation failed", {
        jobId,
        error: getErrorMessage(error),
      });
      throw error;
    }
  }

  private async findDocumentByDedupKey(
    dedupKey: string,
  ): Promise<DocumentEntity | undefined> {
    const documents =
      await this.context.entityService.listEntities<DocumentEntity>({
        entityType: "document",
        options: { filter: { metadata: { dedupKey } } },
      });
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

function getDedupKey(data: MediaDocumentGenerationJobData): string {
  return (
    data.dedupKey ??
    `${data.sourceTemplate}:${data.sourceEntityType}:${data.sourceEntityId}:${data.renderUrl}`
  );
}

function getDocumentId(
  data: MediaDocumentGenerationJobData,
  jobId: string,
): string {
  const base =
    data.documentId ??
    data.filename?.replace(/\.pdf$/i, "") ??
    `${data.sourceTemplate}-${data.sourceEntityType}-${data.sourceEntityId}-${jobId}`;
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
