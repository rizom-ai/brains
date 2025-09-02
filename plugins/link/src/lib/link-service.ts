import type { ServicePluginContext } from "@brains/plugins";
import { LinkAdapter } from "../adapters/link-adapter";
import { UrlUtils } from "./url-utils";

/**
 * Core service for link operations
 */
export class LinkService {
  private linkAdapter: LinkAdapter;

  constructor(private context: ServicePluginContext) {
    this.linkAdapter = new LinkAdapter();
  }

  /**
   * Capture a web link with AI extraction
   * @param url - The URL to capture
   * @param options - Optional parameters including custom entity ID and metadata
   */
  async captureLink(
    url: string,
    options?: {
      id?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<{
    entityId: string;
    title: string;
    url: string;
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
      };
    }

    // Use AI to extract content from the URL using our custom template
    const extractionResult = await this.context.generateContent({
      templateName: "link:extraction",
      prompt: `Fetch and analyze the webpage at: ${url}`,
      data: { url },
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

    // Validate required fields
    if (
      !extractedData.title ||
      !extractedData.description ||
      !extractedData.summary
    ) {
      throw new Error("AI extraction failed to provide all required fields");
    }

    // Use keywords from AI extraction
    const keywords = extractedData.keywords ?? [];

    // Debug logging for keywords
    this.context.logger.info("Extracted keywords", {
      keywords,
    });

    // Create structured content using adapter
    const linkBody = this.linkAdapter.createLinkBody({
      title: extractedData.title,
      url,
      description: extractedData.description,
      summary: extractedData.summary,
      keywords,
    });

    // Create entity with deterministic ID
    const entity = await this.context.entityService.createEntity({
      id: entityId,
      entityType: "link",
      content: linkBody,
      metadata: options?.metadata ?? {},
    });

    return {
      entityId: entity.entityId,
      title: extractedData.title,
      url,
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
      description: string;
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
        description: parsed.description,
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
      description: string;
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
        description: parsed.description,
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
    description: string;
    summary: string;
    keywords: string[];
    domain: string;
    capturedAt: string;
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
      description: parsed.description,
      summary: parsed.summary,
      keywords: parsed.keywords,
      domain: parsed.domain,
      capturedAt: parsed.capturedAt,
    };
  }
}
