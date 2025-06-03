import type { PluginTool, EntityService, Registry } from "@brains/types";
import type { WebserverManager } from "./webserver-manager";
import { z } from "zod";
import {
  landingHeroDataSchema,
  siteContentSchema,
} from "@brains/site-content-entity";

/**
 * Create MCP tools for the webserver plugin
 */
export function webserverTools(
  manager: WebserverManager,
  registry: Registry,
): PluginTool[] {
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
      handler: async (input): Promise<Record<string, unknown>> => {
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
          const message =
            error instanceof Error ? error.message : "Unknown error";
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
      handler: async (): Promise<Record<string, unknown>> => {
        try {
          const url = await manager.startPreviewServer();
          return {
            success: true,
            url,
            message: `Preview server started at ${url}`,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
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
      handler: async (): Promise<Record<string, unknown>> => {
        try {
          const url = await manager.startProductionServer();
          return {
            success: true,
            url,
            message: `Production server started at ${url}`,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
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
      handler: async (input): Promise<Record<string, unknown>> => {
        const { type } = input as { type: "preview" | "production" };

        try {
          await manager.stopServer(type);
          return {
            success: true,
            message: `${type} server stopped`,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
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
      handler: async (): Promise<Record<string, unknown>> => {
        try {
          const url = await manager.preview();
          return {
            success: true,
            url,
            message: `Site built and preview server started at ${url}`,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
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
      handler: async (): Promise<Record<string, unknown>> => {
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

    {
      name: "capture_generated_content",
      description:
        "Capture AI-generated content as a site-content entity for future use",
      inputSchema: {
        page: z
          .string()
          .describe("The page this content is for (e.g., 'landing')"),
        section: z.string().describe("The section of the page (e.g., 'hero')"),
        data: landingHeroDataSchema.describe("The content data to capture"),
      },
      handler: async (input): Promise<Record<string, unknown>> => {
        const { page, section, data } = input as {
          page: string;
          section: string;
          data: z.infer<typeof landingHeroDataSchema>;
        };

        try {
          const entityService =
            registry.resolve<EntityService>("entityService");

          // Create a predictable title matching our lookup format
          const title = `${page}:${section}`;

          // Create the site-content entity using proper schema
          const siteContentData = siteContentSchema.omit({ id: true }).parse({
            entityType: "site-content",
            title,
            content: `Generated content for ${page} page, ${section} section`,
            tags: ["site-content", page, section, "generated"],
            page,
            section,
            data,
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          });

          const entity = await entityService.createEntity(siteContentData);

          return {
            success: true,
            message: `Content captured as entity ${entity.id}`,
            entityId: entity.id,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Unknown error";
          return {
            success: false,
            error: message,
          };
        }
      },
    },
  ];
}
