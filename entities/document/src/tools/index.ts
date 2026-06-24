import type { Tool, ToolContext } from "@brains/plugins";
import { createTool, toolError, toolSuccess } from "@brains/plugins";
import type { z } from "@brains/utils/zod";
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
      'Preview or prepare a PDF document attachment from a source attachment or render URL. For save/regenerate durable document requests, including deck carousel PDFs and printable post/project/product PDFs, prefer system_create with entityType: "document" and from.',
      documentGenerationJobSchemaBase,
      async (input, context) => {
        const result = documentGenerationJobSchema.safeParse(input);
        if (!result.success) {
          return toolError(result.error.message);
        }
        const documentId = getDocumentId(result.data);
        const jobId = await enqueueDocumentGeneration(
          { ...result.data, documentId },
          context,
        );
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
