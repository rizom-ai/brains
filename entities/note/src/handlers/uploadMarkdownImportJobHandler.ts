import { BaseJobHandler, saveProcessedEntity } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import { JobResult } from "@brains/contracts";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { updateFrontmatterField } from "@brains/utils/markdown";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { noteAdapter } from "../adapters/note-adapter";
import { extractMarkdownFromUpload } from "../lib/upload-markdown-import";

const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

export interface UploadMarkdownImportJobData {
  uploadId: string;
  entityId: string;
  title?: string | undefined;
}

export const uploadMarkdownImportJobSchema: z.ZodType<UploadMarkdownImportJobData> =
  z.object({
    uploadId: z.string().min(1),
    entityId: z.string().min(1),
    title: z.string().optional(),
  });

export type UploadMarkdownImportJobResult =
  { entityId: string; status: "created" } | { success: false; error: string };

export class UploadMarkdownImportJobHandler extends BaseJobHandler<
  "upload-import",
  UploadMarkdownImportJobData,
  UploadMarkdownImportJobResult
> {
  private readonly context: EntityPluginContext;
  constructor(logger: Logger, context: EntityPluginContext) {
    super(logger, {
      schema: uploadMarkdownImportJobSchema,
      jobTypeName: "upload-import",
    });
    this.context = context;
  }

  async process(
    data: UploadMarkdownImportJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<UploadMarkdownImportJobResult> {
    try {
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Reading uploaded file",
      });

      const upload = await this.context.uploads
        .scoped(webChatUploadsScope)
        .read(data.uploadId);

      await this.reportProgress(progressReporter, {
        progress: 35,
        message: "Extracting markdown from upload",
      });

      const imported = await extractMarkdownFromUpload({
        upload,
        ...(data.title !== undefined ? { title: data.title } : {}),
      });

      await this.reportProgress(progressReporter, {
        progress: 80,
        message: "Saving imported note",
      });

      const now = new Date().toISOString();
      const entity = noteAdapter.fromMarkdown(imported.content);
      const result = await saveProcessedEntity({
        entityService: this.context.entityService,
        entity: {
          id: data.entityId,
          entityType: "note",
          content: imported.content,
          metadata: { title: imported.title, ...entity.metadata },
          created: now,
          updated: now,
        },
      });

      await this.reportProgress(progressReporter, {
        progress: 100,
        message: "Upload imported as markdown note",
      });

      return { entityId: result.entityId, status: "created" };
    } catch (error) {
      await this.markStubFailed(data.entityId, getErrorMessage(error));
      return JobResult.failure(error);
    }
  }

  private async markStubFailed(entityId: string, error: string): Promise<void> {
    try {
      const existing = await this.context.entityService.getEntity({
        entityType: "note",
        id: entityId,
      });
      if (!existing) return;

      await this.context.entityService.updateEntity({
        entity: {
          ...existing,
          content: updateFrontmatterField(
            updateFrontmatterField(existing.content, "status", "failed"),
            "error",
            error,
          ),
          metadata: { ...existing.metadata, status: "failed", error },
        },
      });
    } catch (failure) {
      this.logger.warn("Failed to mark import stub as failed", {
        error: failure,
        entityId,
      });
    }
  }

  protected override summarizeDataForLog(
    data: UploadMarkdownImportJobData,
  ): Record<string, unknown> {
    return {
      uploadId: data.uploadId,
      entityId: data.entityId,
      hasTitle: data.title !== undefined,
    };
  }
}
