import type { Tool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import type { SiteContentService } from "../lib/site-content-service";
import { GenerateOptionsSchema } from "../schemas/generate-options";

export function createSiteContentTools(
  getSiteContentService: () => SiteContentService | undefined,
  pluginId: string,
): Tool[] {
  return [
    createTool(
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

        const result = await siteContentService.generateContent(input, context);

        const message = input.dryRun
          ? `Planned ${result.totalSections} sections. No jobs were queued.`
          : result.queuedSections > 0
            ? `Queued ${result.queuedSections} of ${result.totalSections} sections. Jobs are running in the background.`
            : "No new content to generate. No jobs were queued.";

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
