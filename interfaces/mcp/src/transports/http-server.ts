import { randomUUID, timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IMCPTransport } from "@brains/mcp-service";
import type { TransportLogger } from "./types";
import { createConsoleLogger, adaptLogger } from "./types";
import type { Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";

export interface VerifiedBearerToken {
  subject: string;
  scope?: string[];
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
  /** Idle time after which a session is closed and evicted (default: 30 min) */
  sessionIdleTtlMs?: number;
}

const DEFAULT_SESSION_IDLE_TTL_MS = 30 * 60 * 1000;
const MAX_EVICTION_SWEEP_INTERVAL_MS = 60 * 1000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version, Last-Event-ID",
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
 * StreamableHTTP Server for MCP
 * Provides HTTP/SSE transport for MCP servers
 * Handles session management and request routing
 */
export class StreamableHTTPServer {
  private static instance: StreamableHTTPServer | null = null;
  private transports: Record<string, WebStandardStreamableHTTPServerTransport> =
    {};
  private sessionLastActivity = new Map<string, number>();
  private mcpServer: McpServer | null = null;
  private mcpTransport: IMCPTransport | null = null;
  private server: ReturnType<typeof Bun.serve> | null = null;
  private boundPort: number | null = null;
  private evictionTimer: ReturnType<typeof setInterval> | null = null;
  private readonly config: StreamableHTTPServerConfig;
  private readonly logger: TransportLogger;
  private readonly authConfig: AuthConfig;
  private readonly sessionIdleTtlMs: number;

  constructor(config: StreamableHTTPServerConfig = {}) {
    this.config = config;
    this.logger = this.config.logger
      ? adaptLogger(this.config.logger)
      : createConsoleLogger();

    this.authConfig = config.auth ?? {};
    this.sessionIdleTtlMs =
      config.sessionIdleTtlMs ?? DEFAULT_SESSION_IDLE_TTL_MS;

    // The transport is often mounted on a shared webserver without start(),
    // so the eviction sweep runs from construction. unref'd — it never
    // keeps the process alive.
    this.evictionTimer = setInterval(
      () => this.evictIdleSessions(),
      Math.min(this.sessionIdleTtlMs, MAX_EVICTION_SWEEP_INTERVAL_MS),
    );
    this.evictionTimer.unref();

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

  public static getInstance(
    config?: StreamableHTTPServerConfig,
  ): StreamableHTTPServer {
    StreamableHTTPServer.instance ??= new StreamableHTTPServer(config);
    return StreamableHTTPServer.instance;
  }

  public static resetInstance(): void {
    StreamableHTTPServer.instance = null;
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
    const resourceMetadata = `${requestOrigin(request)}/.well-known/oauth-protected-resource`;
    const entries = {
      resource_metadata: resourceMetadata,
      ...params,
    };
    const serialized = Object.entries(entries)
      .map(([key, value]) => `${key}="${escapeChallengeValue(value)}"`)
      .join(", ");
    return `Bearer ${serialized}`;
  }

  private async authenticate(request: Request): Promise<Response | null> {
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
      return null;
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
      return null;
    } catch (error) {
      this.logger.warn("Authentication failed: Invalid token", error);
      return this.getAuthErrorResponse(
        "Unauthorized: Invalid token",
        401,
        this.getBearerChallenge(request, { error: "invalid_token" }),
      );
    }
  }

  private touchSession(sessionId: string): void {
    this.sessionLastActivity.set(sessionId, Date.now());
  }

  private evictIdleSessions(): void {
    const now = Date.now();
    for (const [sessionId, lastActivity] of this.sessionLastActivity) {
      if (now - lastActivity < this.sessionIdleTtlMs) continue;

      this.logger.info(`Evicting idle session ${sessionId}`);
      this.sessionLastActivity.delete(sessionId);
      const transport = this.transports[sessionId];
      if (transport) {
        delete this.transports[sessionId];
        transport.close().catch((error: unknown) => {
          this.logger.error(
            `Error closing idle transport for session ${sessionId}:`,
            error,
          );
        });
      }
    }
  }

  private async handleMcpRequest(request: Request): Promise<Response> {
    const sessionId = request.headers.get("mcp-session-id") ?? undefined;

    if (request.method === "GET") {
      if (!sessionId || !this.transports[sessionId]) {
        return this.createTextResponse("Invalid or missing session ID", 400);
      }

      this.touchSession(sessionId);
      this.logger.debug(`GET /mcp - SSE stream for session ${sessionId}`);
      return this.withCors(
        await this.transports[sessionId].handleRequest(request),
      );
    }

    if (request.method === "DELETE") {
      if (!sessionId || !this.transports[sessionId]) {
        return this.createTextResponse("Invalid or missing session ID", 400);
      }

      this.logger.info(`DELETE /mcp - Terminating session ${sessionId}`);
      return this.withCors(
        await this.transports[sessionId].handleRequest(request),
      );
    }

    if (request.method === "OPTIONS") {
      return this.withCors(new Response(null, { status: 204 }));
    }

    if (request.method !== "POST") {
      return this.createTextResponse("Method Not Allowed", 405);
    }

    if (!this.mcpServer) {
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

    let parsedBody: unknown;
    try {
      parsedBody = await request.json();
    } catch {
      return this.createJsonResponse(
        {
          jsonrpc: "2.0",
          error: {
            code: -32700,
            message: "Parse error: Invalid JSON body",
          },
          id: null,
        },
        400,
      );
    }
    this.logger.debug(`POST /mcp - Session: ${sessionId ?? "new"}`);

    try {
      let transport: WebStandardStreamableHTTPServerTransport;

      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
        this.touchSession(sessionId);
      } else if (!sessionId && isInitializeRequest(parsedBody)) {
        transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: (): string => randomUUID(),
          onsessioninitialized: (newSessionId: string): void => {
            this.logger.info(`Session initialized: ${newSessionId}`);
            this.transports[newSessionId] = transport;
            this.touchSession(newSessionId);
          },
          onsessionclosed: (closedSessionId: string): void => {
            this.logger.info(`Session closed: ${closedSessionId}`);
            delete this.transports[closedSessionId];
            this.sessionLastActivity.delete(closedSessionId);
          },
        });

        const sessionServer = this.mcpTransport
          ? this.mcpTransport.createMcpServer()
          : this.mcpServer;
        await sessionServer.connect(transport);
      } else {
        return this.createJsonResponse(
          {
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Bad Request: Server not initialized",
            },
            id: null,
          },
          400,
        );
      }

      return this.withCors(
        await transport.handleRequest(request, { parsedBody }),
      );
    } catch (error) {
      this.logger.error("MCP transport error:", error);
      return this.createJsonResponse(
        {
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
          },
        },
        500,
      );
    }
  }

  public async handleRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    this.logger.debug(`${request.method} ${url.pathname}`);

    const authFailure = await this.authenticate(request);
    if (authFailure) {
      return authFailure;
    }

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
        sessions: Object.keys(this.transports).length,
      });
    }

    if (url.pathname === "/mcp") {
      return this.handleMcpRequest(request);
    }

    return this.createTextResponse("Not Found", 404);
  }

  public connectMCPServer(
    mcpServer: McpServer,
    mcpTransport?: IMCPTransport,
  ): void {
    this.mcpServer = mcpServer;
    this.mcpTransport = mcpTransport ?? null;
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
    if (this.evictionTimer) {
      clearInterval(this.evictionTimer);
      this.evictionTimer = null;
    }
    this.sessionLastActivity.clear();

    for (const sessionId in this.transports) {
      try {
        const transport = this.transports[sessionId];
        if (transport) {
          this.logger.debug(`Closing transport for session ${sessionId}`);
          await transport.close();
          delete this.transports[sessionId];
        }
      } catch (error) {
        this.logger.error(
          `Error closing transport for session ${sessionId}:`,
          error,
        );
      }
    }

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

  public getSessionCount(): number {
    return Object.keys(this.transports).length;
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
