import { mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ServicePluginContext, Tool } from "@brains/plugins";
import { createTool, toolError, toolSuccess } from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";

export const MAX_INLINE_PREVIEW_BYTES = 5 * 1024 * 1024;

const previewAttachmentInputSchema = z.object({
  entityType: z.string().describe("Source entity type (e.g. 'deck')"),
  entityId: z.string().describe("Source entity ID"),
  attachmentType: z.string().describe("Attachment type (e.g. 'carousel')"),
});

export function createMediaTools(
  pluginId: string,
  context: ServicePluginContext,
): Tool[] {
  return [
    createTool(
      pluginId,
      "preview-attachment",
      "Resolve a registered attachment provider for preview. Writes the media to a temporary file and returns inline base64 content when small enough for remote inspection.",
      previewAttachmentInputSchema,
      async (input) => {
        if (
          !context.attachments.hasProvider(
            input.entityType,
            input.attachmentType,
          )
        ) {
          return toolError(
            `No attachment provider registered for ${input.entityType}/${input.attachmentType}`,
          );
        }
        try {
          const media = await context.attachments.resolve({
            sourceEntityType: input.entityType,
            sourceEntityId: input.entityId,
            attachmentType: input.attachmentType,
          });
          if (!media) {
            return toolError(
              `Provider for ${input.entityType}/${input.attachmentType} did not produce media for ${input.entityId}`,
            );
          }
          const dir = await mkdtemp(join(tmpdir(), "brain-media-preview-"));
          const path = join(dir, media.filename);
          await writeFile(path, media.data);
          const bytes = media.data.length;
          const inline = bytes <= MAX_INLINE_PREVIEW_BYTES;
          return toolSuccess(
            {
              path,
              filename: media.filename,
              mimeType: media.mimeType,
              bytes,
              inline,
              maxInlineBytes: MAX_INLINE_PREVIEW_BYTES,
              ...(inline
                ? { contentBase64: media.data.toString("base64") }
                : {}),
            },
            inline
              ? `Wrote ${bytes} bytes to ${path} and returned inline preview content`
              : `Wrote ${bytes} bytes to ${path}; artifact exceeds inline preview limit of ${MAX_INLINE_PREVIEW_BYTES} bytes`,
          );
        } catch (error) {
          return toolError(getErrorMessage(error));
        }
      },
    ),
  ];
}
