import type { PluginTool, JobContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import type { SiteContentService } from "../lib/site-content-service";
import { GenerateOptionsSchema } from "../schemas/generate-options";

export function createSiteContentTools(
  getSiteContentService: () => SiteContentService | undefined,
  pluginId: string,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "generate",
      "Generate content for all routes, a specific route, or a specific section",
      GenerateOptionsSchema,
      async (input, context) => {
        const siteContentService = getSiteContentService();
        if (!siteContentService) {
          return {
            success: false,
            error: "Site content service not initialized",
          };
        }

        if (input.sectionId && !input.routeId) {
          return {
            success: false,
            error: "sectionId requires routeId to be specified",
          };
        }

        const metadata: JobContext = {
          rootJobId: `generate-${Date.now()}`,
          progressToken: context.progressToken,
          pluginId,
          operationType: "content_operations",
          interfaceType: context.interfaceType,
          channelId: context.channelId,
        };

        const result = await siteContentService.generateContent(
          input,
          metadata,
        );

        const message = `Generated ${result.queuedSections} of ${result.totalSections} sections. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`;

        return {
          success: true,
          message,
          data: {
            batchId: result.batchId,
            jobsQueued: result.queuedSections,
            totalSections: result.totalSections,
            jobs: result.jobs,
          },
        };
      },
    ),
  ];
}
