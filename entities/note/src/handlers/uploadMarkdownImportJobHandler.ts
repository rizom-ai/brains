import { BaseJobHandler, saveProcessedEntity } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { getErrorMessage, updateFrontmatterField, z } from "@brains/utils";
import { JobResult } from "@brains/contracts";
import { noteAdapter } from "../adapters/note-adapter";
import { extractMarkdownFromUpload } from "../lib/upload-markdown-import";

const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

export const uploadMarkdownImportJobSchema = z.object({
  uploadId: z.string().min(1),
  entityId: z.string().min(1),
  title: z.string().optional(),
});

export type UploadMarkdownImportJobData = z.infer<
  typeof uploadMarkdownImportJobSchema
>;

export type UploadMarkdownImportJobResult =
  | { entityId: string; status: "created" }
  | { success: false; error: string };

export class UploadMarkdownImportJobHandler extends BaseJobHandler<
  "upload-import",
  UploadMarkdownImportJobData,
  UploadMarkdownImportJobResult
> {
  constructor(
    logger: Logger,
    private readonly context: EntityPluginContext,
  ) {
    super(logger, {
      schema: uploadMarkdownImportJobSchema,
      jobTypeName: "upload-import",
    });
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
