import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
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
    createTypedTool(
      pluginId,
      "capture",
      "Save a web link/URL with AI-powered content extraction. Use when users want to bookmark, save, or capture a webpage. The extraction happens asynchronously - the job is queued and processed in the background.",
      captureParamsSchema,
      async (input, toolContext) => {
        // Quick DNS validation to catch obviously invalid domains
        const dnsResult = await validateDomain(input.url);
        if (!dnsResult.valid) {
          return {
            success: false,
            error: dnsResult.error ?? "Invalid domain",
          };
        }

        // Enqueue the link capture job for async processing
        const jobId = await context.jobs.enqueue(
          "capture",
          {
            url: input.url,
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

        return {
          success: true,
          data: {
            jobId,
            url: input.url,
            status: "queued",
          },
          message: `Link capture job queued. The URL will be fetched and content extracted in the background.`,
        };
      },
    ),
  ];
}
