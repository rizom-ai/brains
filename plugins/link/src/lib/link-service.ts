import type { ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";

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
   */
  async captureLink(
    url: string,
    tags?: string[],
  ): Promise<{
    entityId: string;
    title: string;
    url: string;
  }> {
    // Log the capture request
    this.context.logger.debug("Starting link capture", { url, tags });

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
      !extractedData.summary ||
      !extractedData.content
    ) {
      throw new Error("AI extraction failed to provide all required fields");
    }

    // Create structured content using adapter
    const linkBody = this.linkAdapter.createLinkBody({
      title: extractedData.title,
      url,
      description: extractedData.description,
      summary: extractedData.summary,
      content: extractedData.content,
      tags: tags ?? extractedData.suggested_tags ?? [],
    });

    // Create entity
    const entity = await this.context.entityService.createEntity({
      id: createId(),
      entityType: "link",
      content: linkBody,
      metadata: {},
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
      tags: string[];
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
        tags: parsed.tags,
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
    tags?: string[],
    limit: number = 20,
  ): Promise<
    Array<{
      id: string;
      title: string;
      url: string;
      description: string;
      tags: string[];
      domain: string;
      capturedAt: string;
    }>
  > {
    // Build search query
    let searchQuery = query ?? "";

    // Add tag filters to search query
    if (tags && tags.length > 0) {
      const tagQuery = tags.map((tag) => `tags: ${tag}`).join(" OR ");
      searchQuery = searchQuery ? `${searchQuery} AND (${tagQuery})` : tagQuery;
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
        tags: parsed.tags,
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
    content: string;
    tags: string[];
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
      content: parsed.content,
      tags: parsed.tags,
      domain: parsed.domain,
      capturedAt: parsed.capturedAt,
    };
  }
}
