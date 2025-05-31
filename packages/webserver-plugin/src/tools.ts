import type { PluginTool } from "@brains/types";
import type { WebserverManager } from "./webserver-manager";
import { z } from "zod";

/**
 * Create MCP tools for the webserver plugin
 */
export function webserverTools(manager: WebserverManager): PluginTool[] {
  return [
    {
      name: "build_site",
      description: "Generate and build the static website",
      inputSchema: {
        clean: z
          .boolean()
          .optional()
          .describe("Force a clean build by removing previous build artifacts"),
      },
      handler: async (input) => {
        const { clean } = input as { clean?: boolean };
        
        try {
          await manager.buildSite(clean ? { clean: true } : undefined);
          const status = manager.getStatus();
          
          return {
            success: true,
            message: "Site built successfully",
            lastBuild: status.lastBuild,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },

    {
      name: "start_preview_server",
      description: "Start the preview server to test the site locally",
      inputSchema: {},
      handler: async () => {
        try {
          const url = await manager.startPreviewServer();
          return {
            success: true,
            url,
            message: `Preview server started at ${url}`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },

    {
      name: "start_production_server",
      description: "Start the production server to serve the site",
      inputSchema: {},
      handler: async () => {
        try {
          const url = await manager.startProductionServer();
          return {
            success: true,
            url,
            message: `Production server started at ${url}`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },

    {
      name: "stop_server",
      description: "Stop a running server",
      inputSchema: {
        type: z
          .enum(["preview", "production"])
          .describe("Which server to stop"),
      },
      handler: async (input) => {
        const { type } = input as { type: "preview" | "production" };
        
        try {
          await manager.stopServer(type);
          return {
            success: true,
            message: `${type} server stopped`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },

    {
      name: "preview_site",
      description: "Build the site and start preview server in one command",
      inputSchema: {},
      handler: async () => {
        try {
          const url = await manager.preview();
          return {
            success: true,
            url,
            message: `Site built and preview server started at ${url}`,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },

    {
      name: "get_site_status",
      description: "Get the current status of the site and servers",
      inputSchema: {},
      handler: async () => {
        const status = manager.getStatus();
        
        return {
          hasBuild: status.hasBuild,
          lastBuild: status.lastBuild,
          servers: {
            preview: {
              running: status.servers.preview,
              url: status.servers.previewUrl,
            },
            production: {
              running: status.servers.production,
              url: status.servers.productionUrl,
            },
          },
        };
      },
    },
  ];
}