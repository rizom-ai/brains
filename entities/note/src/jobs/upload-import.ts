import { JobResult, SdkError, defineJobContract } from "@brains/contracts";
import type {
  EntityDefinition,
  EntityJobDeclaration,
  EntityJobHandleContext,
  EntityOf,
} from "@brains/sdk/entities";
import {
  contractJob,
  entityRuntime,
} from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { noteMarkdown } from "../lib/note-markdown";
import { extractMarkdownFromUpload } from "../lib/upload-markdown-import";
import type { noteMetadataSchema } from "../schemas/note";
import { parseMarkdown } from "@brains/utils/markdown-frontmatter";

type NoteDefinition = EntityDefinition<"note", typeof noteMetadataSchema>;

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

/** The note's own job: an uploaded file imported as a markdown note. */
export const uploadMarkdownImportJobContract: ReturnType<
  typeof defineJobContract<typeof uploadMarkdownImportJobSchema>
> = defineJobContract({
  type: "note:upload-import",
  input: uploadMarkdownImportJobSchema,
});

export type UploadMarkdownImportJobResult =
  | { entityId: string; status: "created" | "superseded" }
  | { success: false; error: string };

/** A write refused because the note changed after it was read. */
function isConflict(error: unknown): boolean {
  return error instanceof SdkError && error.code === "conflict";
}

/**
 * The stub this import may replace: the note as it is now, unless it changed
 * from the stub the import was queued for.
 */
async function replaceableStub(
  note: NoteDefinition,
  context: EntityJobHandleContext<UploadMarkdownImportJobData>,
): Promise<EntityOf<NoteDefinition> | null | "changed"> {
  const { entityId, stubContentHash } = context.input;
  const current = await context.entities.get(note, entityId);
  if (
    current &&
    stubContentHash !== undefined &&
    current.contentHash !== stubContentHash
  ) {
    return "changed";
  }
  return current;
}

/**
 * Mark the import stub failed, as long as it is still the stub this import
 * was queued for; a note edited since is left alone.
 */
async function markStubFailed(
  note: NoteDefinition,
  context: EntityJobHandleContext<UploadMarkdownImportJobData>,
  error: string,
): Promise<void> {
  const runtime = entityRuntime(context);
  try {
    const stub = await replaceableStub(note, context);
    if (!stub || stub === "changed") return;
    await context.entities.update(note, stub, {
      metadata: { ...stub.metadata, status: "failed", error },
    });
  } catch (failure) {
    runtime.logger.warn("Failed to mark import stub as failed", {
      error: failure,
      entityId: context.input.entityId,
    });
  }
}

/**
 * An uploaded text, JSON or PDF file read from the shared upload store and
 * saved as markdown over the import stub its create wrote, as the package.
 * A note edited while the import was queued is kept, and the import answers
 * superseded.
 */
export function uploadImportJob(
  note: () => NoteDefinition,
): EntityJobDeclaration<typeof uploadMarkdownImportJobSchema> {
  return contractJob(uploadMarkdownImportJobContract, {
    handle: async (context): Promise<UploadMarkdownImportJobResult> => {
      const { input, progress } = context;
      const runtime = entityRuntime(context);
      try {
        await progress.report({
          progress: 10,
          message: "Reading uploaded file",
        });
        const upload = await runtime.uploads.read(input.uploadId);

        await progress.report({
          progress: 35,
          message: "Extracting markdown from upload",
        });
        const imported = await extractMarkdownFromUpload({
          upload,
          ...(input.title !== undefined ? { title: input.title } : {}),
        });

        await progress.report({
          progress: 80,
          message: "Saving imported note",
        });
        const parsed = parseMarkdown(imported.content);
        const decoded = noteMarkdown.decode({
          content: parsed.content,
          frontmatter: parsed.frontmatter,
        });
        const metadata = { ...decoded.metadata, title: imported.title };
        const stub = await replaceableStub(note(), context);
        const superseded = async (): Promise<UploadMarkdownImportJobResult> => {
          await progress.report({
            progress: 100,
            message: "Upload import superseded by newer note content",
          });
          return { entityId: input.entityId, status: "superseded" };
        };
        if (stub === "changed") return await superseded();
        try {
          if (stub) {
            await context.entities.update(note(), stub, {
              content: imported.content,
              metadata,
            });
          } else {
            await context.entities.create(note(), {
              id: input.entityId,
              content: imported.content,
              metadata,
            });
          }
        } catch (error) {
          if (isConflict(error)) return await superseded();
          throw error;
        }

        await progress.report({
          progress: 100,
          message: "Upload imported as markdown note",
        });
        return { entityId: input.entityId, status: "created" };
      } catch (error) {
        await markStubFailed(note(), context, getErrorMessage(error));
        return JobResult.failure(error);
      }
    },
  });
}
