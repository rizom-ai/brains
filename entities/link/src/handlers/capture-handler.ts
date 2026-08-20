import type { LoggerContract } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import { z } from "@brains/utils/zod";
import { PROGRESS_STEPS, JobResult } from "@brains/sdk/services";
import type { IEntityAINamespace, JobEntityAccess } from "@brains/sdk/entities";
import { createLinkContent, parseLinkContent } from "../lib/link-content";
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
export class LinkCaptureJobHandler {
  private readonly logger: LoggerContract;
  private readonly entities: JobEntityAccess;
  private readonly ai: IEntityAINamespace;
  private readonly extractionTemplate: string;
  private urlFetcher: UrlFetcher;

  constructor(
    logger: LoggerContract,
    deps: {
      entities: JobEntityAccess;
      ai: IEntityAINamespace;
      // Resolved by the runtime: only it knows the scope templates register
      // under, and a name written here silently stops resolving if it moves.
      extractionTemplate: string;
    },
    options?: LinkCaptureJobHandlerOptions,
  ) {
    this.logger = logger;
    this.entities = deps.entities;
    this.ai = deps.ai;
    this.extractionTemplate = deps.extractionTemplate;
    this.urlFetcher = new UrlFetcher(
      options?.jinaApiKey ? { jinaApiKey: options.jinaApiKey } : undefined,
    );
  }

  async process(
    data: LinkCaptureJobData,
    jobId: string,
    progressReporter: ProgressContract,
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

      const existingEntity = await this.entities.getEntity({
        entityType: "link",
        id: entityId,
      });

      if (existingEntity) {
        const { frontmatter } = parseLinkContent(existingEntity.content);
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
          const content = createLinkContent({
            status: "pending",
            title,
            url,
            description: error,
            summary: error,
            domain: title,
            capturedAt,
            source,
          });
          await this.entities.saveProcessed({
            id: entityId,
            entityType: "link",
            content,
            metadata: { status: "pending", title },
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

      const extractionResult = await this.ai.generate<LinkExtractionResult>({
        templateName: this.extractionTemplate,
        prompt: fetchResult.success
          ? `Extract structured information from this webpage content:\n\n${fetchResult.content}`
          : `The URL ${url} could not be fetched. Return success: false with error: "${fetchResult.error}"`,
        data: { url, hasContent: fetchResult.success },
        representedIdentity: "none",
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

        const content = createLinkContent({
          status: "pending",
          title,
          url,
          description: extractionResult.description,
          summary: extractionResult.summary,
          domain: new URL(url).hostname,
          capturedAt,
          source,
        });

        const entity = await this.entities.saveProcessed({
          id: entityId,
          entityType: "link",
          content,
          metadata: { status: "pending", title },
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

      const content = createLinkContent({
        status: "draft",
        title: extractionResult.title,
        url,
        description: extractionResult.description,
        summary: extractionResult.summary,
        domain: new URL(url).hostname,
        capturedAt,
        source,
      });

      const entity = await this.entities.saveProcessed({
        id: entityId,
        entityType: "link",
        content,
        metadata: { status: "draft", title: extractionResult.title },
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
}
