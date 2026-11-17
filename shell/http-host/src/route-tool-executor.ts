import { createExternalActorId, PLUGIN_CHANNELS } from "@brains/contracts";
import type {
  IMessageBus,
  RegisteredApiRoute,
  ToolExecuteRequest,
} from "@brains/plugins";

/** Runs a tool-backed API route's tool; resolves to the owning plugin's bus reply. */
export type RouteToolExecutor = (
  route: RegisteredApiRoute,
  args: Record<string, unknown>,
) => Promise<unknown>;

/**
 * Run a route's tool on the plugin that declared it, as an anonymous
 * external caller of the host named `hostId`.
 */
export function createRouteToolExecutor(
  messageBus: Pick<IMessageBus, "send">,
  hostId: string,
): RouteToolExecutor {
  return (route, args) =>
    messageBus.send({
      type: PLUGIN_CHANNELS.toolExecute(route.pluginId),
      payload: {
        // Most routes name a local tool; consolidated tools may name an
        // exact canonical one.
        toolName: route.definition.tool.includes("_")
          ? route.definition.tool
          : `${route.pluginId}_${route.definition.tool}`,
        args,
        interfaceType: hostId,
        actor: {
          kind: "external",
          externalActorId: createExternalActorId(hostId, "anonymous"),
        },
      } satisfies ToolExecuteRequest,
      sender: hostId,
    });
}
