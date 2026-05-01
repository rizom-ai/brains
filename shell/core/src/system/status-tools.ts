import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { z } from "@brains/utils";
import type { SystemServices } from "./types";

export function createStatusTools(services: SystemServices): Tool[] {
  return [
    createTool(
      "system",
      "status",
      "Get system status including model, version, interfaces, and tools",
      z.object({}),
      async () => ({ success: true, data: await services.getAppInfo() }),
      {
        visibility: "public",
        cli: {
          name: "status",
        },
      },
    ),
  ];
}
