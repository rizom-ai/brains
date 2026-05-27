import type { Logger } from "@brains/utils";
import { toolResponseSchema, type Tool, type ToolResponse } from "./types";

export function wrapToolWithResponseValidation(
  pluginId: string,
  tool: Tool,
  logger: Logger,
): Tool {
  return {
    ...tool,
    handler: async (input, context): Promise<ToolResponse> => {
      const raw = await tool.handler(input, context);
      const parsed = toolResponseSchema.safeParse(raw);

      if (parsed.success) {
        return parsed.data;
      }

      logger.error("Tool returned non-compliant response", {
        pluginId,
        toolName: tool.name,
        issues: parsed.error.issues,
      });

      return {
        success: false,
        error: `Tool ${tool.name} returned an invalid response shape`,
      };
    },
  };
}
