import type { PluginTool, ToolResponse, ToolContext } from "@brains/plugins";
import { z, formatAsEntity } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { validateDomain } from "./dns-validation";

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
  return [
    {
      name: `${pluginId}_capture`,
      description:
        "Save a web link/URL with AI-powered content extraction. Use when users want to bookmark, save, or capture a webpage. The extraction happens asynchronously - the job is queued and processed in the background.",
      inputSchema: captureParamsSchema.shape,
      visibility: "anchor",
      handler: async (
        input: unknown,
        toolContext: ToolContext,
      ): Promise<ToolResponse> => {
        const { url } = captureParamsSchema.parse(input);

        try {
          // Quick DNS validation to catch obviously invalid domains
          const dnsResult = await validateDomain(url);
          if (!dnsResult.valid) {
            return {
              success: false,
              error: dnsResult.error,
              formatted: `_Cannot capture link: ${dnsResult.error}_`,
            };
          }

          // Enqueue the link capture job for async processing
          const jobId = await context.enqueueJob(
            "capture",
            {
              url,
              metadata: {
                interfaceId: toolContext.interfaceType,
                userId: toolContext.userId,
                channelId: toolContext.channelId,
                channelName: toolContext.channelName,
                timestamp: new Date().toISOString(),
              },
            },
            toolContext,
            {
              source: `${pluginId}_capture`,
              metadata: {
                operationType: "content_operations",
                operationTarget: "link",
              },
            },
          );

          const formatted = formatAsEntity(
            {
              jobId,
              url,
              status: "queued",
            },
            { title: "Link Capture Queued" },
          );

          return {
            success: true,
            data: {
              jobId,
              url,
              status: "queued",
              message: `Link capture job queued. The URL will be fetched and content extracted in the background.`,
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
