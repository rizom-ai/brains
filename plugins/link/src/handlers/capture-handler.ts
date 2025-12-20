import type { JobHandler } from "@brains/job-queue";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import { LinkAdapter } from "../adapters/link-adapter";
import { UrlFetcher } from "../lib/url-fetcher";
import { UrlUtils } from "../lib/url-utils";
import type { LinkSource, LinkStatus } from "../schemas/link";
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
  status: z.enum(["pending", "draft", "published"]).optional(),
  error: z.string().optional(),
});

export type LinkCaptureResult = z.infer<typeof linkCaptureResultSchema>;

export interface LinkCaptureJobHandlerOptions {
  jinaApiKey?: string;
}

/**
 * Job handler for link capture with AI extraction
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

      const entityId = UrlUtils.generateEntityId(url);

      // Check for existing entity
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
        const { frontmatter } = this.linkAdapter.parseLinkContent(
          existingEntity.content,
        );
        return {
          success: true,
          entityId: existingEntity.id,
          title: frontmatter.title,
          url,
          status: existingEntity.metadata["status"] as LinkStatus,
        };
      }

      // Fetch URL content
      await progressReporter.report({
        progress: 20,
        total: 100,
        message: "Fetching webpage content",
      });

      const fetchResult = await this.urlFetcher.fetch(url);

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

      // Extract content with AI
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

      let extractedData: LinkExtractionResult;
      try {
        extractedData =
          typeof extractionResult === "string"
            ? JSON.parse(extractionResult)
            : extractionResult;
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

      const source = this.resolveSource(metadata);
      const capturedAt = new Date().toISOString();

      // Handle extraction failure or incomplete extraction
      if (
        extractedData.success === false ||
        !extractedData.title ||
        !extractedData.description ||
        !extractedData.summary
      ) {
        const title = extractedData.title ?? new URL(url).hostname;

        this.logger.info("Incomplete extraction, saving as pending", {
          url,
        });

        await progressReporter.report({
          progress: 80,
          total: 100,
          message: "Saving link as pending",
        });

        const content = this.linkAdapter.createLinkContent({
          status: "pending",
          title,
          url,
          description: extractedData.description,
          summary: extractedData.summary,
          keywords: extractedData.keywords ?? [],
          domain: new URL(url).hostname,
          capturedAt,
          source,
        });

        const entity = await this.context.entityService.createEntity({
          id: entityId,
          entityType: "link",
          content,
          metadata: { status: "pending", title },
        });

        await progressReporter.report({
          progress: 100,
          total: 100,
          message: "Link saved (pending)",
        });

        return {
          success: true,
          entityId: entity.entityId,
          title,
          url,
          status: "pending",
        };
      }

      // Complete extraction - save as draft
      await progressReporter.report({
        progress: 80,
        total: 100,
        message: `Saving link: "${extractedData.title}"`,
      });

      const content = this.linkAdapter.createLinkContent({
        status: "draft",
        title: extractedData.title,
        url,
        description: extractedData.description,
        summary: extractedData.summary,
        keywords: extractedData.keywords ?? [],
        domain: new URL(url).hostname,
        capturedAt,
        source,
      });

      const entity = await this.context.entityService.createEntity({
        id: entityId,
        entityType: "link",
        content,
        metadata: { status: "draft", title: extractedData.title },
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
        status: "draft",
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
   * Resolve source from metadata
   */
  private resolveSource(metadata?: LinkCaptureJobData["metadata"]): LinkSource {
    const channelId = metadata?.channelId;

    if (channelId) {
      return {
        ref: `matrix:${channelId}`,
        label: channelId,
      };
    }

    const interfaceId = metadata?.interfaceId ?? "cli";
    return {
      ref: `${interfaceId}:local`,
      label: interfaceId.toUpperCase(),
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
