import type { PluginTool, ToolResponse } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkService } from "../lib/link-service";

// Schema for tool parameters
const captureParamsSchema = z.object({
  url: z.string().url(),
});

/**
 * Create link plugin tools
 * Note: list/search/get functionality is provided by system_list, system_search, system_get
 */
export function createLinkTools(
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  const linkService = new LinkService(context);

  return [
    {
      name: `${pluginId}_capture`,
      description:
        "Save a web link/URL with AI-powered content extraction. Use when users want to bookmark, save, or capture a webpage.",
      inputSchema: captureParamsSchema.shape,
      visibility: "anchor",
      handler: async (input): Promise<ToolResponse> => {
        const { url } = captureParamsSchema.parse(input);

        try {
          const result = await linkService.captureLink(url);
          const formatted = formatAsEntity(
            {
              id: result.entityId,
              title: result.title,
              url: result.url,
              status: "captured",
            },
            { title: "Link Captured" },
          );

          return {
            success: true,
            data: {
              ...result,
              message: `Successfully captured link: ${result.title}`,
            },
            formatted,
          };
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            error: msg,
            formatted: `_Error capturing link: ${msg}_`,
          };
        }
      },
    },
  ];
}
