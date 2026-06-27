import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import { z } from "@brains/utils/zod-v4";
import type { SystemServices } from "./types";

function compactAppInfo(
  info: Record<string, unknown>,
): Record<string, unknown> {
  const {
    entityCounts: _entityCounts,
    daemons: _daemons,
    endpoints: _endpoints,
    interactions: _interactions,
    ...compact
  } = info;
  return compact;
}

export function createStatusTools(services: SystemServices): Tool[] {
  return [
    createTool(
      "system",
      "status",
      "Get system status including model, version, interfaces, and tools",
      z.object({}),
      async () => ({
        success: true,
        data: compactAppInfo(await services.getAppInfo()),
      }),
      {
        visibility: "public",
        cli: {
          name: "status",
        },
      },
    ),
  ];
}
