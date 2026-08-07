import type { Context } from "hono";
import { createExternalActorId } from "@brains/contracts";
import { toolResultSchema } from "@brains/plugins";
import { PLUGIN_CHANNELS } from "@brains/contracts";
import type { RegisteredApiRoute, IMessageBus } from "@brains/plugins";

/**
 * Create a Hono handler for a registered plugin API route.
 * Parses the request, invokes the plugin tool via the message bus,
 * and returns the response (JSON or redirect).
 */
export function createApiRouteHandler(
  route: RegisteredApiRoute,
  messageBus: IMessageBus,
): (c: Context) => Promise<Response> {
  return async (c: Context): Promise<Response> => {
    const req = c.req.raw;
    const contentType = req.headers.get("content-type") ?? "";
    const acceptsJson = req.headers.get("accept")?.includes("application/json");

    // Parse request body
    let args: Record<string, unknown> = {};
    if (contentType.includes("application/json")) {
      args = await req.json();
    } else if (contentType.includes("form")) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        args[key] = value;
      }
    }

    // Call tool via message bus. Most plugin routes use local tool names, but
    // consolidated tools may intentionally target an exact canonical name.
    const toolName = route.definition.tool.includes("_")
      ? route.definition.tool
      : `${route.pluginId}_${route.definition.tool}`;
    const response = await messageBus.send({
      type: PLUGIN_CHANNELS.toolExecute(route.pluginId),
      payload: {
        toolName,
        args,
        interfaceType: "webserver",
        actor: {
          kind: "external",
          externalActorId: createExternalActorId("webserver", "anonymous"),
        },
      },
      sender: "webserver",
    });

    // The message bus wraps the tool result in { success, data }
    // Extract and validate the inner tool result
    const innerData =
      typeof response === "object" && "data" in response
        ? response.data
        : response;

    const parseResult = toolResultSchema.safeParse(innerData);
    const toolResult = parseResult.success ? parseResult.data : innerData;
    const success = parseResult.success && parseResult.data.success === true;

    // Return response based on Accept header and route config
    if (acceptsJson) {
      return c.json(toolResult, success ? 200 : 400);
    }

    // Redirect for form submissions
    if (success && route.definition.successRedirect) {
      return c.redirect(route.definition.successRedirect);
    }
    if (!success && route.definition.errorRedirect) {
      return c.redirect(route.definition.errorRedirect);
    }

    // Default JSON response if no redirect configured
    return c.json(toolResult, success ? 200 : 400);
  };
}
