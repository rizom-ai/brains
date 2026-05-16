import type { Tool, ToolContext } from "@brains/plugins";
import { createTool, toolError, toolSuccess } from "@brains/plugins";
import type { z } from "@brains/utils";
import {
  documentGenerationJobSchema,
  documentGenerationJobSchemaBase,
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
      "Generate a durable PDF document entity from a render URL, with optional provenance and target documents[] attachment.",
      documentGenerationJobSchemaBase,
      async (input, context) => {
        const result = documentGenerationJobSchema.safeParse(input);
        if (!result.success) {
          return toolError(result.error.message);
        }
        const jobId = await enqueueDocumentGeneration(result.data, context);
        return toolSuccess({ jobId });
      },
      {
        cli: { name: "document-generate" },
      },
    ),
  ];
}
