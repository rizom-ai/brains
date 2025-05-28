import express, { type Express } from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import asyncHandler from "express-async-handler";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../types";

export interface StreamableHTTPServerConfig {
  port?: number | string;
  host?: string;
  logger?: Logger;
}

/**
 * StreamableHTTP Server for MCP
 * Provides HTTP/SSE transport for MCP servers
 * Handles session management and request routing
 */
export class StreamableHTTPServer {
  private app: Express;
  private transports: Record<string, StreamableHTTPServerTransport> = {};
  private mcpServer: McpServer | null = null;
  private server: ReturnType<Express["listen"]> | null = null;
  private readonly config: StreamableHTTPServerConfig;
  private readonly logger: Logger;

  constructor(config: StreamableHTTPServerConfig = {}) {
    this.config = config;
    this.logger = this.config.logger ?? {
      info: (msg: string) => console.log(`[StreamableHTTP] ${msg}`),
      debug: (msg: string) => console.debug(`[StreamableHTTP] ${msg}`),
      error: (msg: string, err?: unknown) =>
        console.error(`[StreamableHTTP] ${msg}`, err),
      warn: (msg: string) => console.warn(`[StreamableHTTP] ${msg}`),
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(express.json());
    this.app.use(cors()); // Enable CORS for MCP Inspector

    // Request logging
    this.app.use((req, _res, next) => {
      this.logger.debug(`${req.method} ${req.path}`);
      next();
    });
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
      const port = this.config.port ?? 3333;
      res.json({
        sessions: Object.keys(this.transports).length,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        port,
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
          `POST /mcp - Session: ${req.headers["mcp-session-id"] || "new"}`,
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
              sessionIdGenerator: () => randomUUID(),
              onsessioninitialized: (sessionId) => {
                this.logger.info(`Session initialized: ${sessionId}`);
                this.transports[sessionId] = transport;
              },
            });

            // Set up onclose handler
            transport.onclose = () => {
              const sid = transport.sessionId;
              if (sid && this.transports[sid]) {
                this.logger.info(`Session closed: ${sid}`);
                delete this.transports[sid];
              }
            };

            // Connect transport to MCP server
            // @ts-expect-error - MCP SDK type issue: sessionId is string | undefined
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
  }

  /**
   * Connect an MCP server to this transport
   */
  public connectMCPServer(mcpServer: McpServer): void {
    this.mcpServer = mcpServer;
    this.logger.info("MCP server connected to StreamableHTTP transport");
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
          this.logger.info(
            `StreamableHTTP server listening on http://${host}:${port}/mcp`,
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
          resolve();
        });
      });
    }
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
