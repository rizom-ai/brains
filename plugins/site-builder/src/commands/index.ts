import type {
  Command,
  CommandResponse,
  ServicePluginContext,
  JobContext,
} from "@brains/plugins";
import type { SiteContentService } from "../lib/site-content-service";
import type { SiteBuilderConfig } from "../config";
import { Logger } from "@brains/utils";

export function createSiteBuilderCommands(
  siteContentService: SiteContentService | undefined,
  context: ServicePluginContext | undefined,
  config: SiteBuilderConfig,
  pluginId: string,
): Command[] {
  const logger = Logger.getInstance().child("SiteBuilderCommands");

  return [
    {
      name: "site-generate",
      description:
        "Generate content for all routes, a specific route, or a specific section",
      usage: "/site-generate [routeId] [sectionId] [--force] [--dry-run]",
      handler: async (args): Promise<CommandResponse> => {
        // Parse command arguments
        const dryRun = args.includes("--dry-run");
        const force = args.includes("--force");
        const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
        const routeId = filteredArgs[0];
        const sectionId = filteredArgs[1];

        // Validate that sectionId is only used with routeId
        if (sectionId && !routeId) {
          return {
            type: "message",
            message: "❌ sectionId requires routeId to be specified",
          };
        }

        if (!siteContentService || !context) {
          return {
            type: "message",
            message:
              "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
          };
        }

        try {
          // Use the site content service to generate content
          const result = await siteContentService.generateContent({
            routeId,
            sectionId,
            force,
            dryRun,
          });

          if (dryRun) {
            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "message",
              message: `🔍 **Dry run completed** - No content was actually generated for ${scope}. Use \`/site-generate\` without --dry-run to execute.`,
            };
          }

          const scope = routeId
            ? sectionId
              ? `section ${routeId}:${sectionId}`
              : `route ${routeId}`
            : "all routes";
          return {
            type: "batch-operation",
            message: `🚀 **Content generation started** - Generated ${result.queuedSections} of ${result.totalSections} sections for ${scope}. ${result.queuedSections > 0 ? "Jobs are running in the background." : "No new content to generate."}`,
            batchId: result.batchId,
            operationCount: result.queuedSections,
          };
        } catch (error) {
          logger.error("Generate command failed", error);
          return {
            type: "message",
            message: `❌ **Generation failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          };
        }
      },
    },
    {
      name: "site-promote",
      description:
        "Promote all preview content, a specific route, or a specific section to production",
      usage: "/site-promote [routeId] [sectionId] [--dry-run]",
      handler: async (args): Promise<CommandResponse> => {
        // Parse command arguments
        const dryRun = args.includes("--dry-run");
        const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
        const routeId = filteredArgs[0];
        const sectionId = filteredArgs[1];

        // Validate that sectionId is only used with routeId
        if (sectionId && !routeId) {
          return {
            type: "message",
            message: "❌ sectionId requires routeId to be specified",
          };
        }

        if (!siteContentService) {
          return {
            type: "message",
            message:
              "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
          };
        }

        try {
          const batchId = await siteContentService.promoteContent({
            routeId,
            sectionId,
            dryRun,
          });

          if (dryRun) {
            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "message",
              message: `🔍 **Dry run** - Would promote content for ${scope}. Use \`/site-promote\` without --dry-run to execute.`,
            };
          }

          const scope = routeId
            ? sectionId
              ? `section ${routeId}:${sectionId}`
              : `route ${routeId}`
            : "all routes";
          return {
            type: "batch-operation",
            message: `📤 **Promotion started** - Promoting content to production for ${scope}...`,
            batchId,
            operationCount: 1,
          };
        } catch (error) {
          logger.error("Promote command failed", error);
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error occurred";
          // Check for specific error about no content found
          if (errorMsg.includes("No preview content found")) {
            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "message",
              message: `ℹ️ No preview content found to promote for ${scope}.`,
            };
          }
          return {
            type: "message",
            message: `❌ **Promotion failed**: ${errorMsg}`,
          };
        }
      },
    },
    {
      name: "site-rollback",
      description:
        "Rollback all production content, a specific route, or a specific section",
      usage: "/site-rollback [routeId] [sectionId] [--dry-run]",
      handler: async (args): Promise<CommandResponse> => {
        // Parse command arguments
        const dryRun = args.includes("--dry-run");
        const filteredArgs = args.filter((arg) => !arg.startsWith("--"));
        const routeId = filteredArgs[0];
        const sectionId = filteredArgs[1];

        // Validate that sectionId is only used with routeId
        if (sectionId && !routeId) {
          return {
            type: "message",
            message: "❌ sectionId requires routeId to be specified",
          };
        }

        if (!siteContentService) {
          return {
            type: "message",
            message:
              "❌ Site content service not initialized. Please ensure the plugin is properly registered.",
          };
        }

        try {
          const batchId = await siteContentService.rollbackContent({
            routeId,
            sectionId,
            dryRun,
          });

          if (dryRun) {
            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "message",
              message: `🔍 **Dry run** - Would rollback content for ${scope}. Use \`/site-rollback\` without --dry-run to execute.`,
            };
          }

          const scope = routeId
            ? sectionId
              ? `section ${routeId}:${sectionId}`
              : `route ${routeId}`
            : "all routes";
          return {
            type: "batch-operation",
            message: `↩️ **Rollback started** - Rolling back content for ${scope}...`,
            batchId,
            operationCount: 1,
          };
        } catch (error) {
          logger.error("Rollback command failed", error);
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error occurred";
          // Check for specific error about no content found
          if (errorMsg.includes("No production content found")) {
            const scope = routeId
              ? sectionId
                ? `section ${routeId}:${sectionId}`
                : `route ${routeId}`
              : "all routes";
            return {
              type: "message",
              message: `ℹ️ No production content found to rollback for ${scope}.`,
            };
          }
          return {
            type: "message",
            message: `❌ **Rollback failed**: ${errorMsg}`,
          };
        }
      },
    },
    {
      name: "site-build",
      description: "Build static site from existing content",
      usage: "/site-build [preview|production]",
      handler: async (args, commandContext): Promise<CommandResponse> => {
        // Parse environment from args (default to preview)
        const environment = (
          args[0] === "production" ? "production" : "preview"
        ) as "preview" | "production";

        if (!context) {
          return {
            type: "message",
            message:
              "❌ Site builder not initialized. Please ensure the plugin is properly registered.",
          };
        }

        try {
          // Build site directly (same logic as build-site tool)
          // Choose output directory based on environment
          const outputDir =
            environment === "production"
              ? config.productionOutputDir
              : config.previewOutputDir;

          const jobData = {
            environment,
            outputDir,
            workingDir: config.workingDir,
            enableContentGeneration: false,
            siteConfig: config.siteConfig ?? {
              title: "Personal Brain",
              description: "A knowledge management system",
            },
          };

          const metadata: JobContext = {
            rootJobId: `site-build-${Date.now()}`,
            progressToken: commandContext.messageId,
            pluginId,
            operationType: "content_operations",
          };

          // Queue the job for async processing
          const jobId = await context.enqueueJob("site-build", jobData, {
            priority: 5,
            source: "command:site-build",
            metadata,
          });

          return {
            type: "job-operation",
            message: `🔨 **Site build started** - Building ${environment} site to \`${outputDir}\`...`,
            jobId,
          };
        } catch (error) {
          logger.error("Build-site command failed", error);
          return {
            type: "message",
            message: `❌ **Build failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          };
        }
      },
    },
  ];
}
