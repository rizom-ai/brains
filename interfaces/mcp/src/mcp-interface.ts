import { FatalPluginConfigurationError } from "@brains/plugins";
import type {
  DaemonHealth,
  IMCPTransport,
  UserPermissionLevel,
  WebRouteDefinition,
} from "@brains/plugins";
import { MCP_INTERACTION_ID } from "@brains/contracts";
import type { PluginPackageDefinition } from "@brains/sdk";
import { defineInterface } from "@brains/sdk/interfaces";
import {
  interfaceRuntime,
  withDaemon,
  withProtocolPlugin,
  withTools,
  withWebRoutes,
  type FirstPartySlotContext,
  type InterfaceRuntime,
} from "@brains/sdk/internal/interface-runtime";
import { StdioMCPServer } from "./transports/stdio-server";
import { StreamableHTTPServer } from "./transports/http-server";
import { mcpConfigSchema, type MCPConfig } from "./config";
import { mcpProtocol } from "./mcp-protocol";
import { createMCPTools } from "./tools";
import { setupJobProgressListener } from "./handlers";

/**
 * The MCP host a running interface keeps: the brain's MCP service once the
 * daemon connects it, and the stdio or shared-HTTP transport it serves.
 */
interface MCPHost {
  mcpTransport: IMCPTransport | undefined;
  stdioServer: StdioMCPServer | undefined;
  httpServer: StreamableHTTPServer | undefined;
}

type MCPSlotContext = FirstPartySlotContext<MCPConfig, MCPHost>;

/**
 * The HTTP transport over the shared webserver, created once: a static
 * bearer token when configured, the auth backend's bearer grants when the
 * brain has one, and none otherwise.
 */
function httpServerOf(
  host: MCPHost,
  config: MCPConfig,
  runtime: InterfaceRuntime,
): StreamableHTTPServer {
  if (host.httpServer) {
    return host.httpServer;
  }

  const authService = runtime.auth();

  host.httpServer = StreamableHTTPServer.createFresh({
    port: config.httpPort,
    logger: runtime.logger,
    auth: config.authToken
      ? { token: config.authToken }
      : authService
        ? {
            requiredScopes: ["mcp"],
            verifyBearerToken: async (
              request,
            ): Promise<
              | {
                  subject: string;
                  scope?: string[];
                  permissionLevel?: "admin" | "trusted" | "public";
                  isAnchor?: boolean;
                  actor?: {
                    kind: "user";
                    userId: string;
                    canonicalId?: string;
                  };
                  displayName?: string;
                }
              | undefined
            > => {
              const grant = await authService.resolveBearerGrant(request);
              if (!grant) return undefined;
              return {
                subject: grant.token.subject,
                scope: grant.token.scope,
                permissionLevel: grant.principal.permissionLevel,
                isAnchor: grant.principal.isAnchor,
                actor: {
                  kind: "user",
                  userId: grant.principal.userId,
                  ...(grant.principal.canonicalId
                    ? { canonicalId: grant.principal.canonicalId }
                    : {}),
                },
                displayName: grant.principal.displayName,
              };
            },
          }
        : { disabled: true },
  });

  return host.httpServer;
}

/**
 * MCP: the Model Context Protocol server, with transport-based permissions.
 * Over stdio it serves the process's own client as admin; over HTTP it
 * mounts /mcp on the shared webserver and resolves each caller's
 * permission from a static token or the auth backend's bearer grants.
 */
const mcp = defineInterface({
  id: "mcp",
  config: mcpConfigSchema,
  setup: (context): MCPHost => {
    const { config } = context;
    const runtime = interfaceRuntime(context);

    if (runtime.production && config.authToken) {
      throw new FatalPluginConfigurationError(
        "mcp",
        "MCP static bearer token (plugins.mcp.authToken / MCP_AUTH_TOKEN) is for local development only; a production brain refuses it. Remove it and connect MCP clients through OAuth with passkeys.",
      );
    }

    if (config.transport === "http" && !runtime.servesHttp) {
      throw new Error(
        "MCP HTTP transport requires the brain to serve HTTP (http.enabled). Standalone HTTP listeners have been removed.",
      );
    }

    runtime.logger.debug(
      `MCP interface initialized with ${config.transport} transport`,
    );

    // Advertise the MCP endpoint so it surfaces in the dashboard's
    // Endpoints card. HTTP transport mounts on the shared webserver at
    // `/mcp`; stdio has no URL to advertise.
    if (config.transport === "http") {
      runtime.endpoint({
        label: "MCP",
        url: "/mcp",
        priority: 30,
        visibility: "trusted",
      });
      runtime.interaction({
        id: MCP_INTERACTION_ID,
        label: "MCP",
        description:
          "Connect a trusted client through the Model Context Protocol.",
        href: "/mcp",
        kind: "protocol",
        priority: 30,
        visibility: "trusted",
      });
    }

    setupJobProgressListener(runtime, runtime.logger);

    return {
      mcpTransport: undefined,
      stdioServer: undefined,
      httpServer: undefined,
    };
  },
});

/** The shared-host routes, over HTTP only, each served by the MCP transport. */
const withRoutes = withWebRoutes(mcp, (context: MCPSlotContext) => {
  const { config, state } = context;
  if (config.transport !== "http") {
    return [];
  }
  const runtime = interfaceRuntime(context);
  const handleWithSharedTransport = (request: Request): Promise<Response> =>
    httpServerOf(state, config, runtime).handleRequest(request);
  const route = (
    path: string,
    method: NonNullable<WebRouteDefinition["method"]>,
  ): WebRouteDefinition => ({
    path,
    method,
    public: true,
    handler: handleWithSharedTransport,
  });

  return [
    route("/status", "GET"),
    route("/mcp", "GET"),
    route("/mcp", "POST"),
    route("/mcp", "DELETE"),
    route("/mcp", "OPTIONS"),
  ];
});

/** The MCP server's lifecycle, mcp:mcp, as its class ran it. */
const withServer = withDaemon(withRoutes, (context: MCPSlotContext) => {
  const { config, state } = context;
  const runtime = interfaceRuntime(context);
  const { logger } = runtime;
  const apiUrl = (): string =>
    runtime.domain
      ? `https://${runtime.domain}/mcp`
      : "http://localhost:8080/mcp";

  const isServerRunning = (): boolean =>
    config.transport === "stdio"
      ? state.stdioServer !== undefined && state.mcpTransport !== undefined
      : state.httpServer !== undefined && state.mcpTransport !== undefined;

  const startServer = async (): Promise<void> => {
    const mcpTransport = runtime.mcpTransport;
    state.mcpTransport = mcpTransport;

    // The user ID permission rules key the transport by.
    const transportUserId = config.transport === "stdio" ? "stdio" : "http";

    let userLevel: UserPermissionLevel = runtime.permissions.getUserLevel(
      "mcp",
      transportUserId,
    );

    const authBackend = runtime.auth();
    const hasHttpAuth =
      config.transport === "http" &&
      (config.authToken ? true : authBackend !== undefined);

    // Static-token auth uses administrator permissions. OAuth requests replace
    // this fallback with the authenticated principal's level on every call.
    if (hasHttpAuth) {
      userLevel = "admin";
      logger.debug(
        "HTTP authentication configured; caller permissions resolve per request",
      );
    }

    if (config.mode === "debug") {
      if (config.transport === "http" && !hasHttpAuth) {
        throw new Error(
          "MCP debug mode requires authenticated HTTP transport; configure authToken or OAuth auth service.",
        );
      }

      if (userLevel !== "admin") {
        throw new Error("MCP debug mode requires admin permissions.");
      }
    }

    // Pass the protocol mode and permission level to the MCP transport
    mcpTransport.setProtocolMode(config.mode);
    mcpTransport.setPermissionLevel(userLevel);
    mcpTransport.setAnchorStatus?.(
      runtime.permissions.isAnchor("mcp", transportUserId),
    );

    logger.debug(
      `Starting MCP ${config.transport} transport in ${config.mode} mode with ${userLevel} permissions`,
    );

    if (config.transport === "stdio") {
      // Don't pass the regular logger for stdio - it will use stderr logger
      state.stdioServer = StdioMCPServer.createFresh();
      state.stdioServer.connectMCPServer(mcpTransport.getMcpServer());
      await state.stdioServer.start();
      logger.debug("MCP STDIO transport started");
    } else {
      // HTTP transport — auth required unless token is absent
      const httpServer = httpServerOf(state, config, runtime);
      httpServer.connectMCPServer(mcpTransport.getMcpServer(), mcpTransport);
      logger.debug("MCP HTTP transport mounted on shared webserver host");
    }
  };

  const stopServer = async (): Promise<void> => {
    logger.debug(`Stopping MCP ${config.transport} transport`);

    if (state.stdioServer) {
      state.stdioServer.stop();
      state.stdioServer = undefined;
    }

    if (state.httpServer) {
      await state.httpServer.stop();
      state.httpServer = undefined;
    }

    // The MCP service manages the lifecycle of its server; only the
    // reference goes.
    state.mcpTransport = undefined;
  };

  return {
    id: "mcp",
    start: startServer,
    stop: stopServer,
    healthCheck: async (): Promise<DaemonHealth> => {
      const isRunning = isServerRunning();

      let message = "MCP server not running";
      if (isRunning) {
        message =
          config.transport === "http"
            ? `MCP HTTP: ${apiUrl()}`
            : "MCP stdio server running";
      }

      return {
        status: isRunning ? "healthy" : "error",
        message,
        lastCheck: new Date(),
        details: {
          transport: config.transport,
          mode: config.mode,
          url: config.transport === "http" ? apiUrl() : undefined,
          running: isRunning,
        },
      };
    },
  };
});

/** The chat and confirm tools, which route a client's requests to the agent. */
const withMCPTools = withTools(withServer, (context) => {
  const runtime = interfaceRuntime(context);
  return createMCPTools("mcp", () => runtime);
});

/**
 * MCP, hosted, with the protocol-only registration a host that serves the
 * protocol itself builds from it, in the configured mode.
 */
export const mcpInterface: PluginPackageDefinition<
  typeof mcpConfigSchema,
  "interface"
> = withProtocolPlugin(withMCPTools, mcpProtocol, ({ mode }) => ({ mode }));
