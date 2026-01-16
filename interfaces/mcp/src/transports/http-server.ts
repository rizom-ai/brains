import express, {
  type Express,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import asyncHandler from "express-async-handler";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { TransportLogger } from "./types";
import { createConsoleLogger, adaptLogger } from "./types";
import type { Logger } from "@brains/utils";
import type { IAgentService } from "@brains/agent-service";

export interface AuthConfig {
  enabled: boolean;
  token?: string | undefined;
}

export interface StreamableHTTPServerConfig {
  port?: number | string;
  host?: string;
  logger?: Logger | TransportLogger;
  auth?: AuthConfig;
}

/**
 * StreamableHTTP Server for MCP
 * Provides HTTP/SSE transport for MCP servers
 * Handles session management and request routing
 */
export class StreamableHTTPServer {
  private static instance: StreamableHTTPServer | null = null;
  private app: Express;
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private mcpServer: McpServer | null = null;
  private agentService: IAgentService | null = null;
  private server: ReturnType<Express["listen"]> | null = null;
  private boundPort: number | null = null;
  private readonly config: StreamableHTTPServerConfig;
  private readonly logger: TransportLogger;
  private readonly authConfig: AuthConfig;

  constructor(config: StreamableHTTPServerConfig = {}) {
    this.config = config;
    // Use the provided logger or default to console logger for HTTP
    this.logger = this.config.logger
      ? adaptLogger(this.config.logger)
      : createConsoleLogger();

    // Initialize auth configuration
    this.authConfig = config.auth ?? { enabled: false };

    if (this.authConfig.enabled && !this.authConfig.token) {
      this.logger.warn("Authentication enabled but no token provided!");
    }

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(
    config?: StreamableHTTPServerConfig,
  ): StreamableHTTPServer {
    StreamableHTTPServer.instance ??= new StreamableHTTPServer(config);
    return StreamableHTTPServer.instance;
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  public static resetInstance(): void {
    StreamableHTTPServer.instance = null;
  }

  /**
   * Create a fresh instance (bypasses singleton)
   */
  public static createFresh(
    config?: StreamableHTTPServerConfig,
  ): StreamableHTTPServer {
    return new StreamableHTTPServer(config);
  }

  /**
   * Authentication middleware
   */
  private authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    // Skip auth for health endpoints
    if (req.path === "/health" || req.path === "/status") {
      return next();
    }

    // Check if auth is enabled
    if (!this.authConfig.enabled || !this.authConfig.token) {
      return next();
    }

    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      this.logger.warn(
        `Authentication failed: Missing Bearer token from ${req.ip}`,
      );
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized: Bearer token required",
        },
        id: null,
      });
      return;
    }

    const token = authHeader.substring(7);
    if (token !== this.authConfig.token) {
      this.logger.warn(`Authentication failed: Invalid token from ${req.ip}`);
      res.status(401).json({
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message: "Unauthorized: Invalid token",
        },
        id: null,
      });
      return;
    }

    // Token is valid - authenticated requests get anchor permission
    this.logger.debug(`Authentication successful from ${req.ip}`);
    // Permission level will be set when MCP server is connected
    next();
  };

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(cors()); // Enable CORS for MCP Inspector

    // Request logging
    this.app.use((req, _res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });

    // Apply authentication middleware
    this.app.use(this.authMiddleware);
  }

  private setupRoutes(): void {
    // Health endpoints
    this.app.get("/health", (_req, res) => {
      res.json({
        status: "ok",
        transport: "streamable-http",
        timestamp: new Date().toISOString(),
      });
    });

    this.app.get("/status", (_req, res) => {
      res.json({
        sessions: Object.keys(this.transports).length,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        port: this.boundPort ?? this.config.port ?? 3333,
      });
    });

    // StreamableHTTP endpoint at /mcp
    this.app.post(
      "/mcp",
      asyncHandler(async (req, res) => {
        if (!this.mcpServer) {
          res.status(503).json({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message: "Service Unavailable: MCP server not connected",
            },
            id: null,
          });
          return;
        }

        this.logger.debug(
          `POST /mcp - Session: ${req.headers["mcp-session-id"] ?? "new"}`,
        );

        try {
          const sessionId = req.headers["mcp-session-id"] as string | undefined;
          let transport: StreamableHTTPServerTransport;

          if (sessionId && this.transports[sessionId]) {
            // Reuse existing transport
            transport = this.transports[sessionId];
          } else if (!sessionId && isInitializeRequest(req.body)) {
            // New initialization request
            transport = new StreamableHTTPServerTransport({
              sessionIdGenerator: (): string => randomUUID(),
              onsessioninitialized: (sessionId: string): void => {
                this.logger.info(`Session initialized: ${sessionId}`);
                this.transports[sessionId] = transport;
              },
              onsessionclosed: (sessionId: string): void => {
                this.logger.info(`Session closed: ${sessionId}`);
                delete this.transports[sessionId];
              },
            });

            // Connect transport to MCP server
            await this.mcpServer.connect(transport);

            // Handle the initialization request
            await transport.handleRequest(req, res, req.body);
            return;
          } else {
            // Invalid request
            res.status(400).json({
              jsonrpc: "2.0",
              error: {
                code: -32000,
                message: "Bad Request: Server not initialized",
              },
              id: null,
            });
            return;
          }

          // Handle the request with existing transport
          await transport.handleRequest(req, res, req.body);
        } catch (error) {
          this.logger.error("MCP transport error:", error);
          if (!res.headersSent) {
            res.status(500).json({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Internal error",
              },
            });
          }
        }
      }),
    );

    // Handle GET requests for SSE streams
    this.app.get(
      "/mcp",
      asyncHandler(async (req, res) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (!sessionId || !this.transports[sessionId]) {
          res.status(400).send("Invalid or missing session ID");
          return;
        }

        this.logger.debug(`GET /mcp - SSE stream for session ${sessionId}`);
        const transport = this.transports[sessionId];
        await transport.handleRequest(req, res);
      }),
    );

    // Handle DELETE requests for session termination
    this.app.delete(
      "/mcp",
      asyncHandler(async (req, res) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (!sessionId || !this.transports[sessionId]) {
          res.status(400).send("Invalid or missing session ID");
          return;
        }

        this.logger.info(`DELETE /mcp - Terminating session ${sessionId}`);
        const transport = this.transports[sessionId];
        await transport.handleRequest(req, res);
      }),
    );

    // Agent chat endpoint for evaluation and remote access
    this.app.post(
      "/api/chat",
      asyncHandler(async (req, res) => {
        if (!this.agentService) {
          res.status(503).json({
            error: "Agent service not connected",
          });
          return;
        }

        const { message, conversationId } = req.body as {
          message?: string;
          conversationId?: string;
        };

        if (!message || typeof message !== "string") {
          res.status(400).json({
            error: "Missing or invalid 'message' field",
          });
          return;
        }

        const convId = conversationId ?? randomUUID();
        this.logger.debug(`POST /api/chat - conversation: ${convId}`);

        try {
          const response = await this.agentService.chat(message, convId);
          res.json(response);
        } catch (error) {
          this.logger.error("Agent chat error:", error);
          res.status(500).json({
            error: error instanceof Error ? error.message : "Internal error",
          });
        }
      }),
    );
  }

  /**
   * Connect an MCP server to this transport
   */
  public connectMCPServer(mcpServer: McpServer): void {
    this.mcpServer = mcpServer;
    this.logger.debug("MCP server connected to StreamableHTTP transport");
  }

  /**
   * Connect an agent service for chat endpoint
   */
  public connectAgentService(agentService: IAgentService): void {
    this.agentService = agentService;
    this.logger.debug("Agent service connected to StreamableHTTP transport");
  }

  /**
   * Start the HTTP server
   */
  public async start(): Promise<void> {
    if (this.server) {
      throw new Error("Server is already running");
    }

    const port = this.config.port ?? 3333;
    const host = this.config.host ?? "0.0.0.0";

    return new Promise((resolve, reject) => {
      this.server = this.app
        .listen(Number(port), host, () => {
          // Get the actual bound port (important when port 0 is used)
          const address = this.server?.address();
          this.boundPort =
            typeof address === "object" && address
              ? address.port
              : Number(port);
          this.logger.info(
            `StreamableHTTP server listening on http://${host}:${this.boundPort}/mcp`,
          );
          resolve();
        })
        .on("error", (err: Error & { code?: string }) => {
          if (err.code === "EADDRINUSE") {
            this.logger.error(`Port ${port} is already in use`);
          }
          reject(err);
        });
    });
  }

  /**
   * Stop the HTTP server and clean up
   */
  public async stop(): Promise<void> {
    // Close all active transports
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

    // Close the HTTP server
    if (this.server) {
      return new Promise((resolve) => {
        this.server?.close(() => {
          this.logger.info("StreamableHTTP server stopped");
          this.server = null;
          this.boundPort = null;
          resolve();
        });
      });
    }
  }

  /**
   * Get the actual bound port (useful when port 0 is used for dynamic allocation)
   */
  public getPort(): number {
    if (this.boundPort === null) {
      throw new Error("Server is not running");
    }
    return this.boundPort;
  }

  /**
   * Get the Express app for additional route configuration
   */
  public getApp(): Express {
    return this.app;
  }

  /**
   * Check if server is running
   */
  public isRunning(): boolean {
    return this.server !== null;
  }

  /**
   * Get active session count
   */
  public getSessionCount(): number {
    return Object.keys(this.transports).length;
  }
}
