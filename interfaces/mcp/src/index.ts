import {
  defineDaemon,
  defineInterface,
  defineRoute,
  verbatim,
  type IMCPTransport,
  type z,
} from "@brains/sdk/interfaces";
import type { Logger } from "@brains/utils/logger";
import { StdioMCPServer } from "./transports/stdio-server";
import {
  StreamableHTTPServer,
  type VerifiedBearerToken,
} from "./transports/http-server";
import { mcpConfigSchema, type MCPConfig, type MCPConfigInput } from "./config";
import { createMCPTools } from "./tools";

export type { MCPConfig, MCPConfigInput } from "./config";
export { mcpConfigSchema } from "./config";

interface MCPState {
  /**
   * The runtime's protocol server. What this interface adds is a transport
   * to reach the registered tools over, plus the mode and permission level
   * that transport confers; the server itself is the runtime's.
   */
  readonly transport: IMCPTransport;
  /**
   * Built once and reused: every route answers through the same HTTP
   * transport, and a second one would answer to nobody. Lazy because stdio
   * never needs one and building it asks auth for a caller resolver.
   */
  http(): StreamableHTTPServer;
  /**
   * What the transport confers on whoever arrives over it.
   *
   * Asked at daemon start rather than at registration: whether HTTP is
   * authenticated depends on auth-service having published a caller, and
   * that happens while plugins are still registering. Reading it here would
   * make the answer depend on registration order.
   */
  transportAccess(): {
    readonly permission: "admin" | "trusted" | "public";
    readonly isAnchor: boolean;
  };
  readonly url: string | undefined;
  readonly logger: Logger;
  /** Owned by the daemon; held here so start and stop see the same one. */
  servers: {
    stdio: StdioMCPServer | undefined;
    http: StreamableHTTPServer | undefined;
  };
}

const mcpInterface = defineInterface({
  id: "mcp",
  config: mcpConfigSchema,

  // `setup` comes first so its return type is inferred before any slot whose
  // context carries `state`.
  setup: ({
    config,
    plugins,
    endpoints,
    interactions,
    mcpTransport,
    permissions,
    auth,
    domain,
    logger,
  }): MCPState => {
    // The shared HTTP host is a fact about the deployment, and an interface
    // that mounts on it cannot answer requests without it. Standalone HTTP
    // listeners have been removed.
    if (config.transport === "http" && !plugins.has("webserver")) {
      throw new Error(
        "MCP HTTP transport requires the webserver interface. Standalone HTTP listeners have been removed.",
      );
    }

    const url =
      config.transport === "http"
        ? domain
          ? `https://${domain}/mcp`
          : "http://localhost:8080/mcp"
        : undefined;

    if (config.transport === "http") {
      // Advertise the endpoint so it surfaces in the Endpoints card; stdio
      // has no URL to advertise.
      endpoints.register({
        label: "MCP",
        url: "/mcp",
        priority: 30,
        visibility: "trusted",
      });
      interactions.register({
        id: "mcp",
        label: "MCP",
        description:
          "Connect a trusted client through the Model Context Protocol.",
        href: "/mcp",
        kind: "protocol",
        priority: 30,
        visibility: "trusted",
      });
    }

    // A transport, not a person: stdio is whoever runs the process.
    const transportUserId = config.transport === "stdio" ? "stdio" : "http";
    // Resolved on use, never cached: auth-service publishes its caller while
    // plugins are still registering, so an answer taken now would depend on
    // which of the two registered first.
    const httpAuthenticated = (): boolean =>
      config.transport === "http" &&
      (config.authToken ? true : auth.getCaller() !== undefined);

    let http: StreamableHTTPServer | undefined;
    const state: MCPState = {
      transport: mcpTransport,
      http: (): StreamableHTTPServer => {
        const caller = auth.getCaller();
        http ??= StreamableHTTPServer.createFresh({
          port: config.httpPort,
          logger,
          auth: config.authToken
            ? { token: config.authToken }
            : caller
              ? {
                  requiredScopes: ["mcp"],
                  verifyBearerToken: async (
                    request,
                  ): Promise<VerifiedBearerToken | undefined> => {
                    const grant = await caller.resolveBearerGrant(request);
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
        return http;
      },
      transportAccess: () => {
        // Static-token or OAuth auth confers administrator permissions;
        // OAuth requests then replace it with the authenticated principal's
        // own level on every call.
        const permission = httpAuthenticated()
          ? ("admin" as const)
          : permissions.getUserLevel("mcp", transportUserId);
        if (config.mode === "debug") {
          if (config.transport === "http" && !httpAuthenticated()) {
            throw new Error(
              "MCP debug mode requires authenticated HTTP transport; configure authToken or OAuth auth service.",
            );
          }
          if (permission !== "admin") {
            throw new Error("MCP debug mode requires admin permissions.");
          }
        }
        return {
          permission,
          isAnchor: permissions.isAnchor("mcp", transportUserId),
        };
      },
      url,
      logger,
      servers: { stdio: undefined, http: undefined },
    };
    return state;
  },

  tools: () => createMCPTools(),

  routes: ({ config, state }) =>
    config.transport === "http"
      ? (["/status", "/mcp"] as const).flatMap((path) =>
          (path === "/status"
            ? (["GET"] as const)
            : (["GET", "POST", "DELETE", "OPTIONS"] as const)
          ).map((method) =>
            defineRoute({
              method,
              path,
              security: { kind: "public" },
              // The MCP protocol answers for itself: an event stream, the
              // status codes the spec defines, the session header its
              // clients read back. None of that is ours to reshape.
              response: verbatim,
              handle: ({ request }) => state.http().handleRequest(request),
            }),
          ),
        )
      : [],

  daemons: ({ config, state }) => [
    defineDaemon({
      id: "transport",
      // Not required: boot does not wait on the transport. A brain whose MCP
      // listener is slow or absent still answers everywhere else, and the
      // class this replaced never blocked startup on it either.
      required: false,
      check: () => {
        const running =
          config.transport === "stdio"
            ? state.servers.stdio !== undefined
            : state.servers.http !== undefined;
        return {
          status: running ? "healthy" : "error",
          message: running
            ? config.transport === "http"
              ? `MCP HTTP: ${state.url ?? "http://localhost:8080/mcp"}`
              : "MCP stdio server running"
            : "MCP server not running",
        };
      },
      async run({ signal, health }) {
        // Asked now, not at registration: this is the first moment auth is
        // certain to have mounted, and debug mode refuses without it.
        const { permission, isAnchor } = state.transportAccess();
        state.transport.setProtocolMode(config.mode);
        state.transport.setPermissionLevel(permission);
        state.transport.setAnchorStatus?.(isAnchor);
        state.logger.debug(
          `Starting MCP ${config.transport} transport in ${config.mode} mode with ${permission} permissions`,
        );

        if (config.transport === "stdio") {
          // No logger: stdio owns the stream this one would write to.
          const stdio = StdioMCPServer.createFresh();
          stdio.connectMCPServer(state.transport.getMcpServer());
          await stdio.start();
          state.servers.stdio = stdio;
          state.logger.debug("MCP STDIO transport started");
        } else {
          const http = state.http();
          http.connectMCPServer(
            state.transport.getMcpServer(),
            state.transport,
          );
          state.servers.http = http;
          state.logger.debug(
            "MCP HTTP transport mounted on shared webserver host",
          );
        }

        health.ready();
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });

        state.logger.debug(`Stopping MCP ${config.transport} transport`);
        state.servers.stdio?.stop();
        state.servers.stdio = undefined;
        await state.servers.http?.stop();
        state.servers.http = undefined;
      },
    }),
  ],
});

export interface MCPInterfacePackage {
  readonly kind: "rizom-plugin-package";
  readonly family: "interface";
  readonly id: string;
  readonly config: z.ZodType<MCPConfig, MCPConfigInput>;
}

const mcpPackage: MCPInterfacePackage = mcpInterface;
export default mcpPackage;
