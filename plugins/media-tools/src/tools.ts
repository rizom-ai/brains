import { writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import type { ServicePluginContext, Tool } from "@brains/plugins";
import { createTool, toolError, toolSuccess } from "@brains/plugins";
import { getErrorMessage, z } from "@brains/utils";

const previewAttachmentInputSchema = z.object({
  entityType: z.string().describe("Source entity type (e.g. 'deck')"),
  entityId: z.string().describe("Source entity ID"),
  attachmentType: z.string().describe("Attachment type (e.g. 'carousel')"),
  outputDir: z
    .string()
    .optional()
    .describe("Directory to write the file into (defaults to the OS temp dir)"),
});

export function createMediaTools(
  pluginId: string,
  context: ServicePluginContext,
): Tool[] {
  return [
    createTool(
      pluginId,
      "preview-attachment",
      "Resolve a registered attachment provider and write the resulting media to a file for local preview.",
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
          const dir = input.outputDir ?? tmpdir();
          const path = join(dir, media.filename);
          await writeFile(path, media.data);
          return toolSuccess(
            {
              path,
              mimeType: media.mimeType,
              bytes: media.data.length,
            },
            `Wrote ${media.data.length} bytes to ${path}`,
          );
        } catch (error) {
          return toolError(getErrorMessage(error));
        }
      },
    ),
  ];
}
