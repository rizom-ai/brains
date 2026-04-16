import { Hono, type Context } from "hono";
import type { Server } from "bun";
import type { Logger } from "@brains/utils";
import { toolResultSchema } from "@brains/plugins";
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

    // Call tool via message bus
    const toolName = `${route.pluginId}_${route.definition.tool}`;
    const response = await messageBus.send(
      `plugin:${route.pluginId}:tool:execute`,
      {
        toolName,
        args,
        interfaceType: "webserver",
        userId: "anonymous",
      },
      "webserver",
    );

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

export interface ApiServerOptions {
  logger: Logger;
  port: number;
  routes: RegisteredApiRoute[];
  messageBus: IMessageBus;
}

/**
 * Shared-host API route handler utilities.
 *
 * Plugin API routes now run on the main webserver surface, but this helper
 * remains as the adapter from registered API routes to Hono handlers.
 */
export class ApiServer {
  private server: Server<unknown> | null = null;
  private logger: Logger;
  private port: number;
  private routes: RegisteredApiRoute[];
  private messageBus: IMessageBus;

  constructor(options: ApiServerOptions) {
    this.logger = options.logger;
    this.port = options.port;
    this.routes = options.routes;
    this.messageBus = options.messageBus;
  }

  async start(): Promise<string> {
    if (this.server) {
      this.logger.warn("API server already running");
      return `http://localhost:${this.port}`;
    }

    if (this.routes.length === 0) {
      this.logger.debug("No API routes registered, skipping API server");
      return "";
    }

    const app = new Hono();

    // Mount each route
    for (const route of this.routes) {
      const handler = createApiRouteHandler(route, this.messageBus);
      const method = route.definition.method.toLowerCase() as
        | "get"
        | "post"
        | "put"
        | "delete";

      app[method](route.fullPath, handler);
      this.logger.debug(
        `Mounted API route: ${route.definition.method} ${route.fullPath} -> ${route.pluginId}_${route.definition.tool}`,
      );
    }

    this.server = Bun.serve({
      port: this.port,
      fetch: app.fetch,
    });

    const url = `http://localhost:${this.port}`;
    this.logger.info(
      `API server started at ${url} (${this.routes.length} routes)`,
    );
    return url;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await this.server.stop();
    this.server = null;
    this.logger.debug("API server stopped");
  }
}
