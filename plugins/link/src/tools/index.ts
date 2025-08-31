import type { PluginTool, ToolResponse } from "@brains/plugins";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkService } from "../lib/link-service";

// Schema for tool parameters
const captureParamsSchema = z.object({
  url: z.string().url(),
  tags: z.array(z.string()).optional(),
});

const listParamsSchema = z.object({
  limit: z.number().min(1).max(100).default(10),
});

const searchParamsSchema = z.object({
  query: z.string().optional(),
  tags: z.array(z.string()).optional(),
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
      name: `${pluginId}:capture`,
      description: "Capture a web link with AI-powered content extraction",
      inputSchema: captureParamsSchema.shape,
      handler: async (input): Promise<ToolResponse> => {
        const { url, tags } = captureParamsSchema.parse(input);

        try {
          const result = await linkService.captureLink(url, tags);
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
      name: `${pluginId}:list`,
      description: "List captured links",
      inputSchema: listParamsSchema.shape,
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
      name: `${pluginId}:search`,
      description: "Search captured links",
      inputSchema: searchParamsSchema.shape,
      handler: async (input): Promise<ToolResponse> => {
        const { query, tags, limit } = searchParamsSchema.parse(input);

        try {
          const links = await linkService.searchLinks(query, tags, limit);
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
      name: `${pluginId}:get`,
      description: "Get a specific link by ID",
      inputSchema: getParamsSchema.shape,
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
