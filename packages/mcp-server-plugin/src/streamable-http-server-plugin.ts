import type { Plugin, PluginCapabilities, PluginContext } from "@brains/types";
import { StreamableHTTPServer } from "@brains/mcp-server";
import type { McpServer } from "@brains/mcp-server";
import { z } from "zod";

export const StreamableHTTPServerOptionsSchema = z.object({
  port: z.union([z.number(), z.string()]).default(3333),
  autoStart: z.boolean().default(true),
  logger: z
    .object({
      info: z.function().args(z.string()).returns(z.void()),
      debug: z.function().args(z.string()).returns(z.void()),
      error: z
        .function()
        .args(z.string(), z.unknown().optional())
        .returns(z.void()),
      warn: z.function().args(z.string()).returns(z.void()),
    })
    .optional(),
});

export type StreamableHTTPServerPluginOptions = z.infer<
  typeof StreamableHTTPServerOptionsSchema
>;

export function streamableHTTPServerPlugin(
  options: Partial<StreamableHTTPServerPluginOptions> = {}
): Plugin {
  const validatedOptions = StreamableHTTPServerOptionsSchema.parse(options);
  let server: StreamableHTTPServer | null = null;
  let context: PluginContext | null = null;

  return {
    id: "streamable-http-server",
    name: "streamable-http-server",
    version: "0.0.1",

    async register(ctx: PluginContext): Promise<PluginCapabilities> {
      context = ctx;

      // Auto-start server if configured
      if (validatedOptions.autoStart) {
        try {
          const mcpServer = context.registry.resolve<McpServer>("mcpServer");
          if (!mcpServer) {
            throw new Error("MCP server not found in registry");
          }

          const serverConfig = {
            port: validatedOptions.port,
            ...(validatedOptions.logger && { logger: validatedOptions.logger }),
          };
          
          server = new StreamableHTTPServer(serverConfig);
          server.connectMCPServer(mcpServer);
          await server.start();

          const port = typeof validatedOptions.port === "string" 
            ? validatedOptions.port 
            : validatedOptions.port.toString();

          context.logger.info(`StreamableHTTP server auto-started on port ${port}`);
        } catch (error) {
          context.logger.error("Failed to auto-start StreamableHTTP server", error);
          throw error;
        }
      }

      return {
        tools: [
          {
            name: "server_start",
            description: "Start the StreamableHTTP server",
            inputSchema: {},
            handler: async () => {
              if (server?.isRunning()) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "Server is already running",
                    },
                  ],
                };
              }

              try {
                // Get MCP server from registry
                const mcpServer = context?.registry.resolve<McpServer>("mcpServer");

                if (!mcpServer) {
                  throw new Error("MCP server not found in registry");
                }

                // Create and start server
                const serverConfig = {
                  port: validatedOptions.port,
                  ...(validatedOptions.logger && { logger: validatedOptions.logger }),
                };
                
                server = new StreamableHTTPServer(serverConfig);
                server.connectMCPServer(mcpServer);
                await server.start();

                const port = typeof validatedOptions.port === "string" 
                  ? validatedOptions.port 
                  : validatedOptions.port.toString();

                return {
                  content: [
                    {
                      type: "text",
                      text: `StreamableHTTP server started on port ${port}`,
                    },
                  ],
                };
              } catch (error) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Failed to start server: ${error}`,
                    },
                  ],
                  isError: true,
                };
              }
            },
          },
          {
            name: "server_stop",
            description: "Stop the StreamableHTTP server",
            inputSchema: {},
            handler: async () => {
              if (!server?.isRunning()) {
                return {
                  content: [
                    {
                      type: "text",
                      text: "Server is not running",
                    },
                  ],
                };
              }

              try {
                await server.stop();
                server = null;
                return {
                  content: [
                    {
                      type: "text",
                      text: "Server stopped successfully",
                    },
                  ],
                };
              } catch (error) {
                return {
                  content: [
                    {
                      type: "text",
                      text: `Failed to stop server: ${error}`,
                    },
                  ],
                  isError: true,
                };
              }
            },
          },
          {
            name: "server_status",
            description: "Get the status of the StreamableHTTP server",
            inputSchema: {},
            handler: async () => {
              const isRunning = server?.isRunning() ?? false;
              const port = typeof validatedOptions.port === "string" 
                ? validatedOptions.port 
                : validatedOptions.port.toString();

              return {
                content: [
                  {
                    type: "text",
                    text: isRunning
                      ? `Server is running on port ${port}`
                      : "Server is not running",
                  },
                ],
              };
            },
          },
        ],
        resources: [],
      };
    },
  };
}