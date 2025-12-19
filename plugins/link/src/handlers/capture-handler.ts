import type { JobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkAdapter } from "../adapters/link-adapter";
import { UrlFetcher } from "../lib/url-fetcher";
import { UrlUtils } from "../lib/url-utils";
import type { LinkSource } from "../schemas/link";
import type { LinkExtractionResult } from "../templates/extraction-template";

/**
 * Input schema for link capture job
 */
export const linkCaptureJobSchema = z.object({
  url: z.string().url(),
  metadata: z
    .object({
      interfaceId: z.string().optional(),
      userId: z.string().optional(),
      channelId: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

export type LinkCaptureJobData = z.infer<typeof linkCaptureJobSchema>;

/**
 * Result schema for link capture job
 */
export const linkCaptureResultSchema = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(["complete", "pending", "failed"]).optional(),
  extractionError: z.string().optional(),
  error: z.string().optional(),
});

export type LinkCaptureResult = z.infer<typeof linkCaptureResultSchema>;

export interface LinkCaptureJobHandlerOptions {
  jinaApiKey?: string;
}

/**
 * Job handler for link capture with AI extraction
 * Handles URL fetching, AI content extraction, and entity creation
 */
export class LinkCaptureJobHandler
  implements JobHandler<"capture", LinkCaptureJobData, LinkCaptureResult>
{
  private linkAdapter: LinkAdapter;
  private urlFetcher: UrlFetcher;

  constructor(
    private logger: Logger,
    private context: ServicePluginContext,
    options?: LinkCaptureJobHandlerOptions,
  ) {
    this.linkAdapter = new LinkAdapter();
    this.urlFetcher = new UrlFetcher(
      options?.jinaApiKey ? { jinaApiKey: options.jinaApiKey } : undefined,
    );
  }

  async process(
    data: LinkCaptureJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<LinkCaptureResult> {
    const { url, metadata } = data;

    try {
      await progressReporter.report({
        progress: 0,
        total: 100,
        message: "Starting link capture",
      });

      // Generate deterministic ID from URL
      const entityId = UrlUtils.generateEntityId(url);

      // Check if entity already exists (for deduplication)
      await progressReporter.report({
        progress: 10,
        total: 100,
        message: "Checking for existing link",
      });

      const existingEntity = await this.context.entityService.getEntity(
        "link",
        entityId,
      );

      if (existingEntity) {
        this.logger.info("Link already captured, returning existing", {
          url,
          entityId,
        });
        const parsed = this.linkAdapter.parseLinkBody(existingEntity.content);
        return {
          success: true,
          entityId: existingEntity.id,
          title: parsed.title,
          url,
          status: parsed.status,
          ...(parsed.extractionError && {
            extractionError: parsed.extractionError,
          }),
        };
      }

      // Fetch URL content using Jina Reader
      await progressReporter.report({
        progress: 20,
        total: 100,
        message: "Fetching webpage content",
      });

      const fetchResult = await this.urlFetcher.fetch(url);

      // Handle URL-level failures
      if (!fetchResult.success) {
        if (
          fetchResult.errorType === "url_not_found" ||
          fetchResult.errorType === "url_unreachable"
        ) {
          this.logger.warn("Link URL not accessible", {
            url,
            errorType: fetchResult.errorType,
            error: fetchResult.error,
          });
          return {
            success: false,
            error: `Could not capture link: ${fetchResult.error}`,
          };
        }
      }

      // Extract structured content using AI
      await progressReporter.report({
        progress: 40,
        total: 100,
        message: "Extracting content with AI",
      });

      const extractionResult =
        await this.context.generateContent<LinkExtractionResult>({
          templateName: "link:extraction",
          prompt: fetchResult.success
            ? `Extract structured information from this webpage content:\n\n${fetchResult.content}`
            : `The URL ${url} could not be fetched. Return success: false with error: "${fetchResult.error}"`,
          data: { url, hasContent: fetchResult.success },
          interfacePermissionGrant: "public",
        });

      this.logger.debug("AI extraction result", {
        type: typeof extractionResult,
        result: extractionResult,
      });

      // Parse the AI response
      let extractedData: LinkExtractionResult;
      try {
        if (typeof extractionResult === "string") {
          extractedData = JSON.parse(extractionResult);
        } else {
          extractedData = extractionResult;
        }
      } catch (parseError) {
        this.logger.error("Failed to parse AI extraction", {
          error:
            parseError instanceof Error
              ? parseError.message
              : String(parseError),
          rawResult: extractionResult,
        });
        return {
          success: false,
          error: `Failed to parse AI extraction result: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        };
      }

      await progressReporter.report({
        progress: 60,
        total: 100,
        message: "Processing extraction results",
      });

      // Determine the source
      const source = this.resolveSource(metadata);

      // Handle extraction failure
      if (extractedData.success === false) {
        const errorMsg =
          extractedData.error ?? "Failed to extract meaningful content";

        this.logger.info("Link content not extractable, saving as pending", {
          url,
          error: errorMsg,
        });

        await progressReporter.report({
          progress: 80,
          total: 100,
          message: "Saving link as pending",
        });

        const linkBody = this.linkAdapter.createLinkBody({
          title: new URL(url).hostname,
          url,
          keywords: [],
          source,
          status: "pending",
          extractionError: errorMsg,
        });

        const entity = await this.context.entityService.createEntity({
          id: entityId,
          entityType: "link",
          content: linkBody,
          metadata: { status: "pending", ...metadata },
        });

        await progressReporter.report({
          progress: 100,
          total: 100,
          message: "Link saved (pending user input)",
        });

        return {
          success: true,
          entityId: entity.entityId,
          title: new URL(url).hostname,
          url,
          status: "pending",
          extractionError: errorMsg,
        };
      }

      // Validate required fields for complete extraction
      if (
        !extractedData.title ||
        !extractedData.description ||
        !extractedData.summary
      ) {
        this.logger.info("Partial extraction, saving as pending", { url });

        const pendingTitle = extractedData.title ?? new URL(url).hostname;
        const linkBody = this.linkAdapter.createLinkBody({
          title: pendingTitle,
          url,
          description: extractedData.description,
          summary: extractedData.summary,
          keywords: extractedData.keywords ?? [],
          source,
          status: "pending",
          extractionError: "Incomplete content extraction",
        });

        await progressReporter.report({
          progress: 80,
          total: 100,
          message: "Saving link as pending (incomplete extraction)",
        });

        const entity = await this.context.entityService.createEntity({
          id: entityId,
          entityType: "link",
          content: linkBody,
          metadata: { status: "pending", ...metadata },
        });

        await progressReporter.report({
          progress: 100,
          total: 100,
          message: "Link saved (pending - incomplete extraction)",
        });

        return {
          success: true,
          entityId: entity.entityId,
          title: pendingTitle,
          url,
          status: "pending",
          extractionError: "Incomplete content extraction",
        };
      }

      // Create complete link entity
      await progressReporter.report({
        progress: 80,
        total: 100,
        message: `Saving link: "${extractedData.title}"`,
      });

      const linkBody = this.linkAdapter.createLinkBody({
        title: extractedData.title,
        url,
        description: extractedData.description,
        summary: extractedData.summary,
        keywords: extractedData.keywords ?? [],
        source,
        status: "complete",
      });

      const entity = await this.context.entityService.createEntity({
        id: entityId,
        entityType: "link",
        content: linkBody,
        metadata: { status: "complete", ...metadata },
      });

      await progressReporter.report({
        progress: 100,
        total: 100,
        message: `Link captured: "${extractedData.title}"`,
      });

      return {
        success: true,
        entityId: entity.entityId,
        title: extractedData.title,
        url,
        status: "complete",
      };
    } catch (error) {
      this.logger.error("Link capture job failed", {
        error,
        jobId,
        data,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Resolve source metadata for the link
   */
  private resolveSource(metadata?: LinkCaptureJobData["metadata"]): LinkSource {
    const channelId = metadata?.channelId;

    if (channelId) {
      // Link captured from a channel (Matrix room, etc.)
      return {
        slug: channelId,
        title: channelId,
        type: "conversation",
      };
    }

    const interfaceId = metadata?.interfaceId ?? "manual";
    return {
      slug: interfaceId,
      title: interfaceId.charAt(0).toUpperCase() + interfaceId.slice(1),
      type: "manual",
    };
  }

  validateAndParse(data: unknown): LinkCaptureJobData | null {
    try {
      return linkCaptureJobSchema.parse(data);
    } catch (error) {
      this.logger.error("Invalid link capture job data", { data, error });
      return null;
    }
  }

  async onError(
    error: Error,
    data: LinkCaptureJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Link capture job error handler triggered", {
      error: error.message,
      jobId,
      url: data.url,
    });
  }
}
