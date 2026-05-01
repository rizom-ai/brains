import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import type { SystemServices } from "./types";
import { insightsInputSchema } from "./schemas";

export function createInsightTools(services: SystemServices): Tool[] {
  const { entityService } = services;

  return [
    createTool(
      "system",
      "insights",
      `Get aggregate content insights and analytics only. For a general overview of actual content, use system_list instead. Available types: ${services.insights.getTypes().join(", ")}.`,
      insightsInputSchema,
      async (input) => {
        const data = await services.insights.get(input.type, entityService);
        return { success: true, data };
      },
      { visibility: "public" },
    ),
  ];
}
