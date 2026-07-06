import { BaseJobHandler } from "@brains/plugins";
import type { EntityPluginContext } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
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
  title?: string | undefined;
}

export const uploadMarkdownImportJobSchema: z.ZodType<UploadMarkdownImportJobData> =
  z.object({
    uploadId: z.string().min(1),
    title: z.string().optional(),
  });

export interface UploadMarkdownImportJobResult {
  entityId: string;
  status: "created";
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
  ): Promise<UploadMarkdownImportJobResult> {
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
    const result = await this.context.entityService.createEntity({
      entity: {
        id: imported.id,
        entityType: "note",
        content: imported.content,
        metadata: { title: imported.title, ...entity.metadata },
        created: now,
        updated: now,
      },
      options: { deduplicateId: true },
    });

    await this.reportProgress(progressReporter, {
      progress: 100,
      message: "Upload imported as markdown note",
    });

    return { entityId: result.entityId, status: "created" };
  }

  protected override summarizeDataForLog(
    data: UploadMarkdownImportJobData,
  ): Record<string, unknown> {
    return {
      uploadId: data.uploadId,
      hasTitle: data.title !== undefined,
    };
  }
}
