import type { EntityCreateRoute, EntityDefinition } from "@brains/sdk/entities";
import {
  entityRuntime,
  type QueuedPlaceholder,
} from "@brains/sdk/internal/entity-runtime";
import { getErrorMessage } from "@brains/utils/error";
import { uploadMarkdownImportJobContract } from "../jobs/upload-import";
import type { noteMetadataSchema } from "../schemas/note";
import {
  getMarkdownImportIdentity,
  isSupportedMarkdownUploadMediaType,
  readTextUploadMarkdown,
} from "./upload-markdown-import";

type NoteDefinition = EntityDefinition<"note", typeof noteMetadataSchema>;

/**
 * An upload kept as a markdown note: a stub titled by the caller's title,
 * the upload's first heading or its file name, written beside any note that
 * already has its id, and the import queued to fill it.
 */
export const noteFromUpload: EntityCreateRoute<typeof noteMetadataSchema> = {
  resolve: async (context) => {
    const { input } = context;
    if (input.from?.kind !== "upload") {
      return { refuse: "Upload ref not found" };
    }
    if (input.transform !== "extract-markdown") {
      return {
        refuse:
          'Importing an upload as a note requires transform: "extract-markdown"',
      };
    }
    const uploadId = input.from.id;
    const record = await context.uploads.readRecord(uploadId).catch(
      // A reference the store cannot resolve names no upload.
      () => undefined,
    );
    if (!record) return { refuse: "Upload ref not found" };
    try {
      if (!isSupportedMarkdownUploadMediaType(record.mediaType)) {
        return {
          refuse:
            "Only text, JSON, and PDF uploads can be imported as markdown notes",
        };
      }
      // Without a given title, a text upload is named by its first heading.
      const markdown =
        input.title === undefined
          ? readTextUploadMarkdown(await context.uploads.read(uploadId))
          : undefined;
      const identity = getMarkdownImportIdentity({
        filename: record.filename,
        title: input.title,
        markdown,
      });
      return entityRuntime(context).queued({
        entityId: identity.id,
        placeholder: {
          content: "",
          metadata: {
            title: identity.title,
            status: "generating",
            titleStated: true,
          },
          ...(input.visibility !== undefined && {
            visibility: input.visibility,
          }),
          deduplicate: true,
        },
        job: {
          contract: uploadMarkdownImportJobContract,
          data: (written: QueuedPlaceholder) => ({
            uploadId,
            entityId: written.entityId,
            stubContentHash: written.contentHash,
            ...(input.title !== undefined && { title: input.title }),
          }),
        },
      });
    } catch (error) {
      return {
        refuse: getErrorMessage(error, "Failed to import upload as markdown"),
      };
    }
  },
};

export type { NoteDefinition };
