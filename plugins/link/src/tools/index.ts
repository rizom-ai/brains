import type { PluginTool, ToolResponse } from "@brains/plugins";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkService } from "../lib/link-service";

// Schema for tool parameters
const captureParamsSchema = z.object({
  url: z.string().url(),
});

const listParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(10),
});

const searchParamsSchema = z.object({
  query: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  limit: z.number().min(1).max(100).default(20),
});

const getParamsSchema = z.object({
  id: z.string(),
});

/**
 * Create link plugin tools
 */
export function createLinkTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  const linkService = new LinkService(context);

  return [
    {
      name: `${pluginId}_capture`,
      description: "Capture a web link with AI-powered content extraction",
      inputSchema: captureParamsSchema.shape,
      visibility: "anchor",
      handler: async (input): Promise<ToolResponse> => {
        const { url } = captureParamsSchema.parse(input);

        try {
          const result = await linkService.captureLink(url);
          return {
            success: true,
            data: {
              ...result,
              message: `Successfully captured link: ${result.title}`,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}_list`,
      description: "List captured links",
      inputSchema: listParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { limit } = listParamsSchema.parse(input);

        try {
          const links = await linkService.listLinks(limit);
          return {
            success: true,
            data: {
              links,
              count: links.length,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}_search`,
      description: "Search captured links",
      inputSchema: searchParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { query, keywords, limit } = searchParamsSchema.parse(input);

        try {
          const links = await linkService.searchLinks(query, keywords, limit);
          return {
            success: true,
            data: {
              links,
              count: links.length,
              query: query ?? "",
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
    {
      name: `${pluginId}_get`,
      description: "Get a specific link by ID",
      inputSchema: getParamsSchema.shape,
      visibility: "public",
      handler: async (input): Promise<ToolResponse> => {
        const { id } = getParamsSchema.parse(input);

        try {
          const link = await linkService.getLink(id);
          if (!link) {
            return {
              success: false,
              error: `Link not found: ${id}`,
            };
          }

          return {
            success: true,
            data: link,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    },
  ];
}
