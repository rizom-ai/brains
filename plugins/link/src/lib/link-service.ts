import type { ServicePluginContext } from "@brains/plugins";
import { z } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";
import { UrlUtils } from "./url-utils";
import { UrlFetcher } from "./url-fetcher";
import type { LinkSource, LinkStatus } from "../schemas/link";

/**
 * Schema for link capture options
 */
export const linkCaptureOptionsSchema = z.object({
  id: z.string().optional(),
  metadata: z
    .object({
      conversationId: z.string().optional(),
      interfaceId: z.string().optional(), // e.g. "cli", "matrix", "mcp"
      userId: z.string().optional(),
      messageId: z.string().optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
});

export type LinkCaptureOptions = z.infer<typeof linkCaptureOptionsSchema>;

export interface LinkServiceOptions {
  /** Jina Reader API key for higher rate limits */
  jinaApiKey?: string;
}

/**
 * Core service for link operations
 */
export class LinkService {
  private linkAdapter: LinkAdapter;
  private urlFetcher: UrlFetcher;

  constructor(
    private context: ServicePluginContext,
    options?: LinkServiceOptions,
  ) {
    this.linkAdapter = new LinkAdapter();
    this.urlFetcher = new UrlFetcher(
      options?.jinaApiKey ? { jinaApiKey: options.jinaApiKey } : undefined,
    );
  }

  /**
   * Capture a web link with AI extraction
   * @param url - The URL to capture
   * @param options - Optional parameters including custom entity ID and metadata
   * @returns Entity info with status indicating if extraction succeeded or is pending user input
   */
  async captureLink(
    url: string,
    options?: LinkCaptureOptions,
  ): Promise<{
    entityId: string;
    title: string;
    url: string;
    status: LinkStatus;
    extractionError?: string;
  }> {
    // Log the capture request
    this.context.logger.debug("Starting link capture", { url });

    // Generate deterministic ID from URL if not provided
    const entityId = options?.id ?? UrlUtils.generateEntityId(url);

    // Check if entity already exists (for deduplication)
    const existingEntity = await this.context.entityService.getEntity(
      "link",
      entityId,
    );
    if (existingEntity) {
      this.context.logger.info("Link already captured, returning existing", {
        url,
        entityId,
      });
      // Return existing entity info
      const parsed = this.linkAdapter.parseLinkBody(existingEntity.content);
      return {
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
    this.context.logger.debug("Fetching URL content", { url });
    const fetchResult = await this.urlFetcher.fetch(url);

    // Handle URL-level failures (don't save, throw error)
    if (!fetchResult.success) {
      if (
        fetchResult.errorType === "url_not_found" ||
        fetchResult.errorType === "url_unreachable"
      ) {
        this.context.logger.warn("Link URL not accessible", {
          url,
          errorType: fetchResult.errorType,
          error: fetchResult.error,
        });
        throw new Error(`Could not capture link: ${fetchResult.error}`);
      }
    }

    // Use AI to extract structured content from the fetched markdown
    const extractionResult = await this.context.generateContent({
      templateName: "link:extraction",
      prompt: fetchResult.success
        ? `Extract structured information from this webpage content:\n\n${fetchResult.content}`
        : `The URL ${url} could not be fetched. Return success: false with error: "${fetchResult.error}"`,
      data: { url, hasContent: fetchResult.success },
      interfacePermissionGrant: "public",
    });

    // Log the raw extraction result
    this.context.logger.debug("AI extraction result", {
      type: typeof extractionResult,
      result: extractionResult,
    });

    // Parse the AI response
    let extractedData;
    try {
      if (typeof extractionResult === "string") {
        extractedData = JSON.parse(extractionResult);
      } else {
        extractedData = extractionResult;
      }
    } catch (parseError) {
      this.context.logger.error("Failed to parse AI extraction", {
        error:
          parseError instanceof Error ? parseError.message : String(parseError),
        rawResult: extractionResult,
      });
      throw new Error(
        `Failed to parse AI extraction result: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
      );
    }

    // Log the parsed data
    this.context.logger.debug("Parsed extraction data", { extractedData });

    // Determine the source - resolve channel name ONCE at creation time and store it
    let source: LinkSource;
    const conversationId = options?.metadata?.conversationId;

    if (conversationId) {
      // Link captured from a conversation
      let conversationTitle = conversationId;
      try {
        const conversation = await this.context.getConversation(conversationId);
        if (conversation?.metadata) {
          const metadata = JSON.parse(conversation.metadata);
          conversationTitle = metadata.channelName ?? conversationId;
        }
      } catch (error) {
        this.context.logger.debug("Could not resolve conversation metadata", {
          conversationId,
          error,
        });
      }
      source = {
        slug: conversationId,
        title: conversationTitle,
        type: "conversation",
      };
    } else {
      // Manual addition (via MCP, direct API call, etc.)
      const interfaceId = options?.metadata?.interfaceId ?? "manual";
      source = {
        slug: interfaceId,
        title: interfaceId.charAt(0).toUpperCase() + interfaceId.slice(1),
        type: "manual",
      };
    }

    // Handle extraction failure (content-level - URL was accessible but content not extractable)
    if (extractedData.success === false) {
      const errorMsg =
        extractedData.error ?? "Failed to extract meaningful content";

      this.context.logger.info(
        "Link content not extractable, saving as pending",
        {
          url,
          error: errorMsg,
        },
      );

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
        metadata: { status: "pending", ...options?.metadata },
      });

      return {
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
      // Partial extraction - save as pending
      this.context.logger.info("Partial extraction, saving as pending", {
        url,
      });

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

      const entity = await this.context.entityService.createEntity({
        id: entityId,
        entityType: "link",
        content: linkBody,
        metadata: { status: "pending", ...options?.metadata },
      });

      return {
        entityId: entity.entityId,
        title: pendingTitle,
        url,
        status: "pending",
        extractionError: "Incomplete content extraction",
      };
    }

    // Debug logging for keywords
    this.context.logger.info("Extracted keywords", {
      keywords: extractedData.keywords,
    });

    // Create structured content using adapter - this STORES the source in the link body
    const linkBody = this.linkAdapter.createLinkBody({
      title: extractedData.title,
      url,
      description: extractedData.description,
      summary: extractedData.summary,
      keywords: extractedData.keywords ?? [],
      source,
      status: "draft",
    });

    // Create entity with deterministic ID
    const entity = await this.context.entityService.createEntity({
      id: entityId,
      entityType: "link",
      content: linkBody,
      metadata: { status: "draft", ...options?.metadata },
    });

    return {
      entityId: entity.entityId,
      title: extractedData.title,
      url,
      status: "draft",
    };
  }

  /**
   * List captured links
   */
  async listLinks(limit: number = 10): Promise<
    Array<{
      id: string;
      title: string;
      url: string;
      description?: string;
      keywords: string[];
      domain: string;
      capturedAt: string;
    }>
  > {
    const results = await this.context.entityService.search("", {
      types: ["link"],
      limit,
      sortBy: "created",
      sortDirection: "desc",
    });

    return results.map((result) => {
      const parsed = this.linkAdapter.parseLinkBody(result.entity.content);
      return {
        id: result.entity.id,
        title: parsed.title,
        url: parsed.url,
        ...(parsed.description && { description: parsed.description }),
        keywords: parsed.keywords,
        domain: parsed.domain,
        capturedAt: parsed.capturedAt,
      };
    });
  }

  /**
   * Search captured links
   */
  async searchLinks(
    query?: string,
    keywords?: string[],
    limit: number = 20,
  ): Promise<
    Array<{
      id: string;
      title: string;
      url: string;
      description?: string;
      keywords: string[];
      domain: string;
      capturedAt: string;
    }>
  > {
    // Build search query
    let searchQuery = query ?? "";

    // Add keyword filters to search query
    if (keywords && keywords.length > 0) {
      const keywordQuery = keywords.map((k) => `keywords: ${k}`).join(" OR ");
      searchQuery = searchQuery
        ? `${searchQuery} AND (${keywordQuery})`
        : keywordQuery;
    }

    const results = await this.context.entityService.search(searchQuery, {
      types: ["link"],
      limit,
      sortBy: "created",
      sortDirection: "desc",
    });

    return results.map((result) => {
      const parsed = this.linkAdapter.parseLinkBody(result.entity.content);
      return {
        id: result.entity.id,
        title: parsed.title,
        url: parsed.url,
        ...(parsed.description && { description: parsed.description }),
        keywords: parsed.keywords,
        domain: parsed.domain,
        capturedAt: parsed.capturedAt,
      };
    });
  }

  /**
   * Get a specific link by ID
   */
  async getLink(linkId: string): Promise<{
    id: string;
    title: string;
    url: string;
    description?: string;
    summary?: string;
    keywords: string[];
    domain: string;
    capturedAt: string;
    status: LinkStatus;
    extractionError?: string;
  } | null> {
    const entity = await this.context.entityService.getEntity("link", linkId);
    if (!entity) {
      return null;
    }

    const parsed = this.linkAdapter.parseLinkBody(entity.content);
    return {
      id: entity.id,
      title: parsed.title,
      url: parsed.url,
      ...(parsed.description && { description: parsed.description }),
      ...(parsed.summary && { summary: parsed.summary }),
      keywords: parsed.keywords,
      domain: parsed.domain,
      capturedAt: parsed.capturedAt,
      status: parsed.status,
      ...(parsed.extractionError && {
        extractionError: parsed.extractionError,
      }),
    };
  }
}
