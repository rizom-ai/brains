import { timingSafeEqual } from "node:crypto";
import {
  createMcpHandler,
  type AuthInfo,
  type McpHttpHandler,
  type McpServer,
} from "@modelcontextprotocol/server";
import type { ActorRef } from "@brains/contracts";
import type { IMCPTransport, ToolVisibility } from "@brains/mcp-service";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type { TransportLogger } from "./types";
import { adaptLogger, createConsoleLogger } from "./types";

export interface VerifiedBearerToken {
  subject: string;
  scope?: string[];
  permissionLevel?: ToolVisibility;
  isAnchor?: boolean;
  actor?: ActorRef;
  displayName?: string;
}

export interface AuthConfig {
  disabled?: boolean;
  token?: string | undefined;
  verifyBearerToken?: (
    request: Request,
  ) => Promise<VerifiedBearerToken | undefined>;
  requiredScopes?: string[];
}

export interface StreamableHTTPServerConfig {
  port?: number | string;
  host?: string;
  logger?: Logger | TransportLogger;
  auth?: AuthConfig;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID, Mcp-Method, Mcp-Name",
  "Access-Control-Allow-Private-Network": "true",
  "X-Content-Type-Options": "nosniff",
} as const;

const errorCodeSchema = z.looseObject({
  code: z.string().optional(),
});

function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto?.split(",")[0]?.trim();
  const host =
    request.headers.get("x-forwarded-host") ?? request.headers.get("host");

  if (!host) return url.origin;
  return `${proto ?? url.protocol.replace(":", "")}://${host}`;
}

/**
 * Stateless MCP HTTP server.
 *
 * Authentication is resolved for every request before the SDK handler runs.
 * The handler then builds a fresh permission-scoped MCP server from the live
 * registry, so protocol clients cannot retain stale capabilities across
 * registry or permission changes.
 */
export class StreamableHTTPServer {
  private mcpTransport: IMCPTransport | null = null;
  private mcpHandler: McpHttpHandler | null = null;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private boundPort: number | null = null;
  private readonly config: StreamableHTTPServerConfig;
  private readonly logger: TransportLogger;
  private readonly authConfig: AuthConfig;

  constructor(config: StreamableHTTPServerConfig = {}) {
    this.config = config;
    this.logger = this.config.logger
      ? adaptLogger(this.config.logger)
      : createConsoleLogger();
    this.authConfig = config.auth ?? {};

    if (
      !this.authConfig.disabled &&
      !this.authConfig.token &&
      !this.authConfig.verifyBearerToken
    ) {
      throw new Error(
        "MCP HTTP transport requires an auth token or bearer token verifier. " +
          "Set MCP_AUTH_TOKEN, configure OAuth verification, or pass auth: { disabled: true } for local dev.",
      );
    }
  }

  public static createFresh(
    config?: StreamableHTTPServerConfig,
  ): StreamableHTTPServer {
    return new StreamableHTTPServer(config);
  }

  private withCors(response: Response): Response {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  private createJsonResponse(data: unknown, status = 200): Response {
    return this.withCors(
      new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  private createTextResponse(body: string, status = 200): Response {
    return this.withCors(
      new Response(body, {
        status,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      }),
    );
  }

  private getAuthErrorResponse(
    message: string,
    status = 401,
    wwwAuthenticate?: string,
  ): Response {
    const response = this.createJsonResponse(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message,
        },
        id: null,
      },
      status,
    );

    if (!wwwAuthenticate) {
      return response;
    }

    const headers = new Headers(response.headers);
    headers.set("WWW-Authenticate", wwwAuthenticate);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  private getBearerChallenge(
    request: Request,
    params: Record<string, string> = {},
  ): string {
    // Static-token mode rejects OAuth-issued JWTs, so advertising the OAuth
    // resource metadata would direct clients into a flow this server cannot accept.
    const entries = {
      ...(this.authConfig.token
        ? {}
        : {
            resource_metadata: `${requestOrigin(request)}/.well-known/oauth-protected-resource`,
          }),
      ...params,
    };
    const serialized = Object.entries(entries)
      .map(([key, value]) => `${key}="${escapeChallengeValue(value)}"`)
      .join(", ");
    return `Bearer ${serialized}`;
  }

  private async authenticate(
    request: Request,
  ): Promise<Response | AuthInfo | null> {
    const pathname = new URL(request.url).pathname;

    if (
      pathname === "/health" ||
      pathname === "/status" ||
      (pathname === "/mcp" && request.method === "OPTIONS")
    ) {
      return null;
    }

    if (this.authConfig.disabled) {
      return null;
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      this.logger.warn("Authentication failed: Missing Bearer token");
      return this.getAuthErrorResponse(
        "Unauthorized: Bearer token required",
        401,
        this.getBearerChallenge(request, { realm: "mcp" }),
      );
    }

    if (this.authConfig.token) {
      const token = authHeader.substring(7);
      if (!constantTimeEquals(token, this.authConfig.token)) {
        this.logger.warn("Authentication failed: Invalid token");
        return this.getAuthErrorResponse(
          "Unauthorized: Invalid token",
          401,
          this.getBearerChallenge(request, { error: "invalid_token" }),
        );
      }

      this.logger.debug("Authentication successful");
      return {
        token,
        clientId: "static-token-client",
        scopes: this.authConfig.requiredScopes ?? [],
        extra: {
          subject: "static-token-operator",
          permissionLevel: "admin",
          isAnchor: false,
          actor: { kind: "service", serviceId: "mcp-static-token" },
        },
      };
    }

    try {
      const verified = await this.authConfig.verifyBearerToken?.(request);
      if (!verified) {
        this.logger.warn("Authentication failed: Invalid token");
        return this.getAuthErrorResponse(
          "Unauthorized: Invalid token",
          401,
          this.getBearerChallenge(request, { error: "invalid_token" }),
        );
      }

      const requiredScopes = this.authConfig.requiredScopes ?? [];
      const missingScopes = requiredScopes.filter(
        (scope) => !verified.scope?.includes(scope),
      );
      if (missingScopes.length > 0) {
        this.logger.warn(
          `Authentication failed: Missing required scope(s): ${missingScopes.join(", ")}`,
        );
        return this.getAuthErrorResponse(
          "Forbidden: Missing required scope",
          403,
          this.getBearerChallenge(request, {
            error: "insufficient_scope",
            scope: requiredScopes.join(" "),
          }),
        );
      }

      this.logger.debug("Authentication successful");
      return {
        token: authHeader.substring(7),
        clientId: verified.subject,
        scopes: verified.scope ?? [],
        extra: {
          subject: verified.subject,
          permissionLevel: verified.permissionLevel,
          isAnchor: verified.isAnchor,
          actor: verified.actor,
          displayName: verified.displayName,
        },
      };
    } catch (error) {
      this.logger.warn("Authentication failed: Invalid token", error);
      return this.getAuthErrorResponse(
        "Unauthorized: Invalid token",
        401,
        this.getBearerChallenge(request, { error: "invalid_token" }),
      );
    }
  }

  private async handleMcpRequest(
    request: Request,
    authInfo: AuthInfo | undefined,
  ): Promise<Response> {
    if (!this.mcpHandler) {
      return this.createJsonResponse(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Service Unavailable: MCP server not connected",
          },
          id: null,
        },
        503,
      );
    }

    try {
      return this.withCors(
        await this.mcpHandler.fetch(request, {
          ...(authInfo ? { authInfo } : {}),
        }),
      );
    } catch (error) {
      this.logger.error("MCP handler error:", error);
      return this.createJsonResponse(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal error" },
          id: null,
        },
        500,
      );
    }
  }

  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.logger.debug(`${request.method} ${url.pathname}`);

    const authentication = await this.authenticate(request);
    if (authentication instanceof Response) {
      return authentication;
    }
    const authInfo = authentication ?? undefined;

    if (url.pathname === "/health") {
      return this.createJsonResponse({
        status: "ok",
        transport: "streamable-http",
        timestamp: new Date().toISOString(),
      });
    }

    if (url.pathname === "/status") {
      return this.createJsonResponse({
        status: "ok",
        protocol: "stateless",
      });
    }

    if (url.pathname === "/mcp" && request.method === "OPTIONS") {
      return this.withCors(new Response(null, { status: 204 }));
    }

    if (url.pathname === "/mcp") {
      return this.handleMcpRequest(request, authInfo);
    }

    return this.createTextResponse("Not Found", 404);
  }

  public connectMCPServer(
    mcpServer: McpServer,
    mcpTransport?: IMCPTransport,
  ): void {
    this.mcpTransport = mcpTransport ?? null;
    this.mcpHandler = createMcpHandler(
      ({ authInfo }) => {
        const permissionLevel = authInfo?.extra?.["permissionLevel"] as
          ToolVisibility | undefined;
        return this.mcpTransport
          ? this.mcpTransport.createMcpServer(permissionLevel)
          : mcpServer;
      },
      {
        onerror: (error): void => {
          this.logger.error("MCP handler error:", error);
        },
      },
    );
    this.logger.debug("MCP server connected to StreamableHTTP transport");
  }

  public async start(): Promise<void> {
    if (this.server) {
      throw new Error("Server is already running");
    }

    const port = Number(this.config.port ?? 3333);
    const host = this.config.host ?? "0.0.0.0";

    try {
      this.server = Bun.serve({
        port,
        hostname: host,
        fetch: (request) => this.handleRequest(request),
      });
      this.boundPort = this.server.port ?? port;
      this.logger.info(
        `StreamableHTTP server listening on http://${host}:${this.boundPort}/mcp`,
      );
    } catch (error) {
      const parsedError = errorCodeSchema.safeParse(error);
      if (parsedError.success && parsedError.data.code === "EADDRINUSE") {
        this.logger.error(`Port ${port} is already in use`);
      }
      throw error;
    }
  }

  public async stop(): Promise<void> {
    await this.mcpHandler?.close();
    this.mcpHandler = null;
    this.mcpTransport = null;

    if (this.server) {
      await this.server.stop();
      this.logger.info("StreamableHTTP server stopped");
      this.server = null;
      this.boundPort = null;
    }
  }

  public getPort(): number {
    if (this.boundPort === null) {
      throw new Error("Server is not running");
    }
    return this.boundPort;
  }

  public getApp(): { fetch: (request: Request) => Promise<Response> } {
    return {
      fetch: (request: Request): Promise<Response> =>
        this.handleRequest(request),
    };
  }

  public isRunning(): boolean {
    return this.server !== null;
  }
}

function escapeChallengeValue(value: string): string {
  return value.replace(/["\\]/g, (match) => `\\${match}`);
}

function constantTimeEquals(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  if (aBuffer.length !== bBuffer.length) {
    return false;
  }
  return timingSafeEqual(aBuffer, bBuffer);
}
