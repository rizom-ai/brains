import type { PluginTool, ToolResponse } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkService } from "../lib/link-service";
import type { LinkConfig } from "../schemas/link";

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
  config?: LinkConfig,
): PluginTool[] {
  const linkService = new LinkService(
    context,
    config?.jinaApiKey ? { jinaApiKey: config.jinaApiKey } : undefined,
  );

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

          // Check if extraction was successful or pending user input
          if (result.status === "pending") {
            const formatted = formatAsEntity(
              {
                id: result.entityId,
                title: result.title,
                url: result.url,
                status: "pending",
                reason: result.extractionError,
              },
              { title: "Link Saved (Pending)" },
            );

            return {
              success: true,
              data: {
                ...result,
                message: `Link saved but content could not be extracted: ${result.extractionError}. Please provide a title, description, and summary for this link.`,
              },
              formatted,
            };
          }

          const formatted = formatAsEntity(
            {
              id: result.entityId,
              title: result.title,
              url: result.url,
              status: "complete",
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
