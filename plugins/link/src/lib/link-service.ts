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
   * Resolve source from capture options
   */
  private async resolveSource(
    options?: LinkCaptureOptions,
  ): Promise<LinkSource> {
    const conversationId = options?.metadata?.conversationId;

    if (conversationId) {
      // Link captured from a conversation (Matrix, etc.)
      let label = conversationId;
      try {
        const conversation = await this.context.getConversation(conversationId);
        if (conversation?.metadata) {
          const metadata = JSON.parse(conversation.metadata);
          label = metadata.channelName ?? conversationId;
        }
      } catch (error) {
        this.context.logger.debug("Could not resolve conversation metadata", {
          conversationId,
          error,
        });
      }
      return {
        ref: `matrix:${conversationId}`,
        label,
      };
    }

    // Manual addition (via MCP, CLI, etc.)
    const interfaceId = options?.metadata?.interfaceId ?? "cli";
    return {
      ref: `${interfaceId}:local`,
      label: interfaceId.toUpperCase(),
    };
  }

  /**
   * Capture a web link with AI extraction
   */
  async captureLink(
    url: string,
    options?: LinkCaptureOptions,
  ): Promise<{
    entityId: string;
    title: string;
    url: string;
    status: LinkStatus;
  }> {
    this.context.logger.debug("Starting link capture", { url });

    const entityId = options?.id ?? UrlUtils.generateEntityId(url);

    // Check for existing entity (deduplication)
    const existingEntity = await this.context.entityService.getEntity(
      "link",
      entityId,
    );
    if (existingEntity) {
      this.context.logger.info("Link already captured, returning existing", {
        url,
        entityId,
      });
      const { frontmatter } = this.linkAdapter.parseLinkContent(
        existingEntity.content,
      );
      return {
        entityId: existingEntity.id,
        title: frontmatter.title,
        url,
        status: existingEntity.metadata["status"] as LinkStatus,
      };
    }

    // Fetch URL content
    this.context.logger.debug("Fetching URL content", { url });
    const fetchResult = await this.urlFetcher.fetch(url);

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

    // Extract content with AI
    const extractionResult = await this.context.generateContent({
      templateName: "link:extraction",
      prompt: fetchResult.success
        ? `Extract structured information from this webpage content:\n\n${fetchResult.content}`
        : `The URL ${url} could not be fetched. Return success: false with error: "${fetchResult.error}"`,
      data: { url, hasContent: fetchResult.success },
      interfacePermissionGrant: "public",
    });

    this.context.logger.debug("AI extraction result", {
      type: typeof extractionResult,
      result: extractionResult,
    });

    let extractedData;
    try {
      extractedData =
        typeof extractionResult === "string"
          ? JSON.parse(extractionResult)
          : extractionResult;
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

    this.context.logger.debug("Parsed extraction data", { extractedData });

    const source = await this.resolveSource(options);
    const capturedAt = new Date().toISOString();

    // Handle extraction failure - save as pending
    if (
      extractedData.success === false ||
      !extractedData.title ||
      !extractedData.description ||
      !extractedData.summary
    ) {
      const title = extractedData.title ?? new URL(url).hostname;

      this.context.logger.info("Incomplete extraction, saving as pending", {
        url,
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

      return {
        entityId: entity.entityId,
        title,
        url,
        status: "pending",
      };
    }

    // Complete extraction - save as draft
    this.context.logger.info("Extracted keywords", {
      keywords: extractedData.keywords,
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
      const { frontmatter } = this.linkAdapter.parseLinkContent(
        result.entity.content,
      );
      return {
        id: result.entity.id,
        title: frontmatter.title,
        url: frontmatter.url,
        ...(frontmatter.description && {
          description: frontmatter.description,
        }),
        keywords: frontmatter.keywords,
        domain: frontmatter.domain,
        capturedAt: frontmatter.capturedAt,
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
    let searchQuery = query ?? "";

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
      const { frontmatter } = this.linkAdapter.parseLinkContent(
        result.entity.content,
      );
      return {
        id: result.entity.id,
        title: frontmatter.title,
        url: frontmatter.url,
        ...(frontmatter.description && {
          description: frontmatter.description,
        }),
        keywords: frontmatter.keywords,
        domain: frontmatter.domain,
        capturedAt: frontmatter.capturedAt,
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
  } | null> {
    const entity = await this.context.entityService.getEntity("link", linkId);
    if (!entity) {
      return null;
    }

    const { frontmatter, summary } = this.linkAdapter.parseLinkContent(
      entity.content,
    );
    return {
      id: entity.id,
      title: frontmatter.title,
      url: frontmatter.url,
      ...(frontmatter.description && { description: frontmatter.description }),
      ...(summary && { summary }),
      keywords: frontmatter.keywords,
      domain: frontmatter.domain,
      capturedAt: frontmatter.capturedAt,
      status: entity.metadata["status"] as LinkStatus,
    };
  }
}
