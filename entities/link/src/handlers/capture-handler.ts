import { BaseJobHandler, saveProcessedEntity } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";
import { PROGRESS_STEPS, JobResult } from "@brains/contracts";
import type { EntityPluginContext } from "@brains/plugins";
import { LinkAdapter } from "../adapters/link-adapter";
import { UrlFetcher } from "../lib/url-fetcher";
import { UrlUtils } from "../lib/url-utils";
import type { LinkSource, LinkStatus } from "../schemas/link";
import type { LinkExtractionResult } from "../templates/extraction-template";

/**
 * Input schema for link capture job
 */
export interface LinkCaptureMetadata {
  interfaceId?: string | undefined;
  userId?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  timestamp?: string | undefined;
}

export interface LinkCaptureJobData {
  url: string;
  metadata?: LinkCaptureMetadata | undefined;
}

const linkCaptureMetadataSchema: z.ZodType<LinkCaptureMetadata> = z.object({
  interfaceId: z.string().optional(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  timestamp: z.string().optional(),
});

export const linkCaptureJobSchema: z.ZodType<LinkCaptureJobData> = z.object({
  url: z.url(),
  metadata: linkCaptureMetadataSchema.optional(),
});

/**
 * Result schema for link capture job
 */
export interface LinkCaptureResult {
  success: boolean;
  entityId?: string | undefined;
  title?: string | undefined;
  url?: string | undefined;
  status?: LinkStatus | undefined;
  error?: string | undefined;
}

export const linkCaptureResultSchema: z.ZodType<LinkCaptureResult> = z.object({
  success: z.boolean(),
  entityId: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  status: z.enum(["pending", "draft", "published"]).optional(),
  error: z.string().optional(),
});

export interface LinkCaptureJobHandlerOptions {
  jinaApiKey?: string;
}

/**
 * Job handler for link capture with AI extraction
 */
export class LinkCaptureJobHandler extends BaseJobHandler<
  "link-capture",
  LinkCaptureJobData,
  LinkCaptureResult
> {
  private readonly context: EntityPluginContext;
  private linkAdapter: LinkAdapter;
  private urlFetcher: UrlFetcher;

  constructor(
    logger: Logger,
    context: EntityPluginContext,
    options?: LinkCaptureJobHandlerOptions,
  ) {
    super(logger, {
      schema: linkCaptureJobSchema,
      jobTypeName: "link-capture",
    });
    this.context = context;
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
        progress: PROGRESS_STEPS.START,
        total: 100,
        message: "Starting link capture",
      });

      const entityId = UrlUtils.generateEntityId(url);

      // Check for existing entity
      await progressReporter.report({
        progress: PROGRESS_STEPS.INIT,
        total: 100,
        message: "Checking for existing link",
      });

      const existingEntity = await this.context.entityService.getEntity({
        entityType: "link",
        id: entityId,
      });

      if (existingEntity) {
        const { frontmatter } = this.linkAdapter.parseLinkContent(
          existingEntity.content,
        );
        const status = existingEntity.metadata["status"] as LinkStatus;

        if (status !== "pending") {
          this.logger.info("Link already captured, returning existing", {
            url,
            entityId,
          });
          return {
            success: true,
            entityId: existingEntity.id,
            title: frontmatter.title,
            url,
            status,
          };
        }

        this.logger.info("Pending link exists, completing extraction", {
          url,
          entityId,
        });
      }

      const source = this.resolveSource(metadata);
      const capturedAt = new Date().toISOString();

      // Fetch URL content
      await progressReporter.report({
        progress: PROGRESS_STEPS.FETCH,
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
          const title = new URL(url).hostname;
          const error = `Could not capture link: ${fetchResult.error}`;
          const content = this.linkAdapter.createLinkContent({
            status: "pending",
            title,
            url,
            description: error,
            summary: error,
            domain: title,
            capturedAt,
            source,
          });
          await saveProcessedEntity({
            entityService: this.context.entityService,
            entity: {
              id: entityId,
              entityType: "link",
              content,
              metadata: { status: "pending", title },
            },
          });
          return {
            success: false,
            entityId,
            title,
            url,
            status: "pending",
            error,
          };
        }
      }

      // Extract content with AI
      await progressReporter.report({
        progress: PROGRESS_STEPS.PROCESS,
        total: 100,
        message: "Extracting content with AI",
      });

      const extractionResult =
        await this.context.ai.generate<LinkExtractionResult>({
          templateName: "link:extraction",
          prompt: fetchResult.success
            ? `Extract structured information from this webpage content:\n\n${fetchResult.content}`
            : `The URL ${url} could not be fetched. Return success: false with error: "${fetchResult.error}"`,
          data: { url, hasContent: fetchResult.success },
          interfacePermissionGrant: "public",
        });

      this.logger.debug("AI extraction result", { result: extractionResult });

      await progressReporter.report({
        progress: PROGRESS_STEPS.EXTRACT,
        total: 100,
        message: "Processing extraction results",
      });

      // Handle extraction failure or incomplete extraction
      if (
        extractionResult.success === false ||
        !extractionResult.title ||
        !extractionResult.description ||
        !extractionResult.summary
      ) {
        const title = extractionResult.title || new URL(url).hostname;

        this.logger.info("Incomplete extraction, saving as pending", {
          url,
        });

        await progressReporter.report({
          progress: PROGRESS_STEPS.SAVE,
          total: 100,
          message: "Saving link as pending",
        });

        const content = this.linkAdapter.createLinkContent({
          status: "pending",
          title,
          url,
          description: extractionResult.description,
          summary: extractionResult.summary,
          domain: new URL(url).hostname,
          capturedAt,
          source,
        });

        const entity = await saveProcessedEntity({
          entityService: this.context.entityService,
          entity: {
            id: entityId,
            entityType: "link",
            content,
            metadata: { status: "pending", title },
          },
        });

        await progressReporter.report({
          progress: PROGRESS_STEPS.COMPLETE,
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
        progress: PROGRESS_STEPS.SAVE,
        total: 100,
        message: `Saving link: "${extractionResult.title}"`,
      });

      const content = this.linkAdapter.createLinkContent({
        status: "draft",
        title: extractionResult.title,
        url,
        description: extractionResult.description,
        summary: extractionResult.summary,
        domain: new URL(url).hostname,
        capturedAt,
        source,
      });

      const entity = await saveProcessedEntity({
        entityService: this.context.entityService,
        entity: {
          id: entityId,
          entityType: "link",
          content,
          metadata: { status: "draft", title: extractionResult.title },
        },
      });

      await progressReporter.report({
        progress: PROGRESS_STEPS.COMPLETE,
        total: 100,
        message: `Link captured: "${extractionResult.title}"`,
      });

      return {
        success: true,
        entityId: entity.entityId,
        title: extractionResult.title,
        url,
        status: "draft",
      };
    } catch (error) {
      this.logger.error("Link capture job failed", {
        error,
        jobId,
        data,
      });

      return JobResult.failure(error);
    }
  }

  /**
   * Resolve source from metadata
   */
  private resolveSource(metadata?: LinkCaptureJobData["metadata"]): LinkSource {
    const channelId = metadata?.channelId;
    const channelName = metadata?.channelName;

    if (channelId) {
      return {
        ref: `matrix:${channelId}`,
        label: channelName ?? channelId,
      };
    }

    const interfaceId = metadata?.interfaceId ?? "cli";
    return {
      ref: `${interfaceId}:local`,
      label: interfaceId.toUpperCase(),
    };
  }

  protected override summarizeDataForLog(
    data: LinkCaptureJobData,
  ): Record<string, unknown> {
    return {
      url: data.url,
      interfaceId: data.metadata?.interfaceId,
    };
  }
}
