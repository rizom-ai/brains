import type { Tool } from "@brains/mcp-service";
import { createTool } from "@brains/mcp-service";
import type { RuntimeAppInfo, UserPermissionLevel } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { SystemServices } from "./types";

/**
 * Status without the volatile or bulky runtime detail, plus the web surfaces
 * the caller may open, so the model reports paths such as /dashboard from the
 * runtime instead of guessing them.
 */
function compactAppInfo(
  info: RuntimeAppInfo,
  canSee: (visibility: UserPermissionLevel) => boolean,
): Record<string, unknown> {
  const {
    entityCounts: _entityCounts,
    daemons: _daemons,
    endpoints,
    interactions: _interactions,
    ...compact
  } = info;
  return {
    ...compact,
    endpoints: endpoints
      .filter((endpoint) => canSee(endpoint.visibility))
      .sort((a, b) => a.priority - b.priority)
      .map(({ label, url }) => ({ label, url })),
  };
}

export function createStatusTools(services: SystemServices): Tool[] {
  return [
    createTool(
      "system",
      "status",
      "Get system status including model, version, background work, and the web surfaces (such as the dashboard and Studio) the caller can open, with their paths",
      z.object({}),
      async (_input, context) => ({
        success: true,
        data: compactAppInfo(await services.getAppInfo(), (visibility) =>
          services.permissionService.hasPermission(
            context.userPermissionLevel ?? "public",
            visibility,
          ),
        ),
      }),
      {
        visibility: "public",
        sideEffects: "none",
        cli: {
          name: "status",
        },
      },
    ),
  ];
}
