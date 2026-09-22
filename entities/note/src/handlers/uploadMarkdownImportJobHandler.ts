import { BaseJobHandler, saveProcessedEntity } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { updateFrontmatterField } from "@brains/utils/markdown";
import type { ProgressReporter } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { noteAdapter } from "../adapters/note-adapter";
import { withMarkdownFromUpload } from "../lib/upload-markdown-import";

const webChatUploadsScope = {
  namespace: "upload",
  refKind: "upload",
  routePath: "/api/chat/uploads",
} as const;

export interface UploadMarkdownImportJobData {
  uploadId: string;
  entityId: string;
  /** Hash of the import stub this job is allowed to replace. */
  stubContentHash?: string | undefined;
  title?: string | undefined;
}

export const uploadMarkdownImportJobSchema: z.ZodType<UploadMarkdownImportJobData> =
  z.object({
    uploadId: z.string().min(1),
    entityId: z.string().min(1),
    stubContentHash: z.string().min(1).optional(),
    title: z.string().optional(),
  });

export interface UploadMarkdownImportJobResult {
  entityId: string;
  status: "created" | "superseded";
}

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
    signal?: AbortSignal,
  ): Promise<UploadMarkdownImportJobResult> {
    const state: { submitted: boolean; borrowedSignal?: AbortSignal } = {
      submitted: false,
    };
    try {
      if (!signal)
        throw new Error("Upload import requires a cancellation signal");
      signal.throwIfAborted();
      await this.reportProgress(progressReporter, {
        progress: 10,
        message: "Reading uploaded file",
      });

      const files = this.context.entityService.fileAssets;
      if (!files?.withProducedFile)
        throw new Error("Upload markdown extraction is not provisioned");
      return await this.context.uploads
        .scoped(webChatUploadsScope)
        .withFile(
          data.uploadId,
          async (upload): Promise<UploadMarkdownImportJobResult> => {
            await this.reportProgress(progressReporter, {
              progress: 35,
              message: "Extracting markdown from upload",
            });

            return withMarkdownFromUpload(
              {
                upload,
                files,
                signal,
                ...(data.title !== undefined ? { title: data.title } : {}),
              },
              async (
                imported,
                borrowedSignal,
              ): Promise<UploadMarkdownImportJobResult> => {
                state.borrowedSignal = borrowedSignal;
                borrowedSignal.throwIfAborted();

                await this.reportProgress(progressReporter, {
                  progress: 80,
                  message: "Saving imported note",
                });

                const now = new Date().toISOString();
                const entity = noteAdapter.fromMarkdown(imported.content);
                borrowedSignal.throwIfAborted();
                state.submitted = true;
                const result = await saveProcessedEntity({
                  signal: borrowedSignal,
                  entityService: this.context.entityService,
                  entity: {
                    id: data.entityId,
                    entityType: "note",
                    content: imported.content,
                    metadata: { title: imported.title, ...entity.metadata },
                    created: now,
                    updated: now,
                  },
                  ...(data.stubContentHash !== undefined
                    ? { expectedContentHash: data.stubContentHash }
                    : {}),
                });

                if (result.mutation.skipReason === "content-conflict") {
                  await this.reportProgress(progressReporter, {
                    progress: 100,
                    message: "Upload import superseded by newer note content",
                  });
                  return { entityId: result.entityId, status: "superseded" };
                }

                await this.reportProgress(progressReporter, {
                  progress: 100,
                  message: "Upload imported as markdown note",
                });

                return { entityId: result.entityId, status: "created" };
              },
            );
          },
        );
    } catch (error) {
      const failures: unknown[] = [error];
      if (
        signal &&
        !state.submitted &&
        !signal.aborted &&
        !state.borrowedSignal?.aborted
      ) {
        try {
          await this.markStubFailed(
            data.entityId,
            getErrorMessage(error),
            data.stubContentHash,
          );
        } catch (failure) {
          if (!Object.is(failure, error)) failures.push(failure);
        }
      }
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          "Upload extraction and pending failure update failed",
          { cause: error },
        );
      throw error;
    }
  }

  private async markStubFailed(
    entityId: string,
    error: string,
    stubContentHash?: string,
  ): Promise<void> {
    const existing = await this.context.entityService.getEntity({
      entityType: "note",
      id: entityId,
      visibilityScope: "restricted",
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
      ...(stubContentHash !== undefined
        ? { options: { expectedContentHash: stubContentHash } }
        : {}),
    });
  }

  protected override summarizeDataForLog(
    data: UploadMarkdownImportJobData,
  ): Record<string, unknown> {
    return {
      uploadId: data.uploadId,
      entityId: data.entityId,
      hasTitle: data.title !== undefined,
      hasStubContentHash: data.stubContentHash !== undefined,
    };
  }
}
