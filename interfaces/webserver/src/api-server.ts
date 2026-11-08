import type { Context } from "hono";
import { toolResultSchema } from "@brains/plugins";
import type { IApiRoutesNamespace, RegisteredApiRoute } from "@brains/plugins";

/**
 * Create a Hono handler for a registered plugin API route.
 * Parses the request, runs the plugin's tool through the interface context,
 * and returns the response (JSON or redirect).
 */
export function createApiRouteHandler(
  route: RegisteredApiRoute,
  executeTool: IApiRoutesNamespace["executeTool"],
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

    const response = await executeTool(route, args);

    // The message bus wraps the tool result in { success, data }
    // Extract and validate the inner tool result
    const innerData =
      typeof response === "object" && response !== null && "data" in response
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
