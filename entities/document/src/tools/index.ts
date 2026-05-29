import type { Tool, ToolContext } from "@brains/plugins";
import { createTool, toolError, toolSuccess } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  documentGenerationJobSchema,
  documentGenerationJobSchemaBase,
  getDocumentId,
} from "../handlers/documentGenerationHandler";

export type DocumentGenerateInput = z.infer<
  typeof documentGenerationJobSchemaBase
>;

export function createDocumentTools(
  pluginId: string,
  enqueueDocumentGeneration: (
    input: DocumentGenerateInput,
    context: ToolContext,
  ) => Promise<string>,
): Tool[] {
  return [
    createTool(
      pluginId,
      "generate",
      "Generate a durable PDF document entity from a source attachment or render URL, with optional target documents[] attachment.",
      documentGenerationJobSchemaBase,
      async (input, context) => {
        const result = documentGenerationJobSchema.safeParse(input);
        if (!result.success) {
          return toolError(result.error.message);
        }
        const jobId = await enqueueDocumentGeneration(result.data, context);
        const documentId = getDocumentId(result.data, jobId);
        const filename = result.data.filename ?? `${documentId}.pdf`;
        return toolSuccess({
          jobId,
          documentId,
          attachment: {
            mediaType: "application/pdf",
            url: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}`,
            downloadUrl: `/api/chat/attachments/document?id=${encodeURIComponent(documentId)}&download=1`,
            filename,
            source: {
              entityType: "document",
              entityId: documentId,
              attachmentType: result.data.attachmentType,
            },
          },
        });
      },
      {
        cli: { name: "document-generate" },
      },
    ),
  ];
}
