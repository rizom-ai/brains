import type { ServicePluginContext } from "@brains/plugins";
import { createId } from "@brains/utils";
import { LinkAdapter } from "../adapters/link-adapter";

/**
 * Core service for link operations
 */
export class LinkService {
  private linkAdapter: LinkAdapter;

  constructor(
    private context: ServicePluginContext,
  ) {
    this.linkAdapter = new LinkAdapter();
  }

  /**
   * Capture a web link with AI extraction
   */
  async captureLink(url: string, tags?: string[]): Promise<{
    entityId: string;
    title: string;
    url: string;
  }> {
    // Use AI to extract content from the URL
    const extractionResult = await this.context.generateContent({
      templateName: "shell:knowledge-query",
      prompt: `Analyze and extract content from this URL: ${url}

Please provide:
1. A clear, descriptive title for the page
2. A one-sentence description of what this page is about
3. A 2-3 paragraph summary of the main content
4. The main content extracted and formatted as clean markdown (maximum 5000 characters)
5. 3-5 relevant tags that categorize this content

Format your response as JSON with these fields:
- title: string
- description: string  
- summary: string
- content: string (markdown format)
- suggested_tags: string[]`,
      data: { url },
      interfacePermissionGrant: "public",
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
      throw new Error(`Failed to parse AI extraction result: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
    }

    // Validate required fields
    if (!extractedData.title || !extractedData.description || !extractedData.summary || !extractedData.content) {
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
  async listLinks(limit: number = 10): Promise<Array<{
    id: string;
    title: string;
    url: string;
    description: string;
    tags: string[];
    domain: string;
    capturedAt: string;
  }>> {
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
  async searchLinks(query?: string, tags?: string[], limit: number = 20): Promise<Array<{
    id: string;
    title: string;
    url: string;
    description: string;
    tags: string[];
    domain: string;
    capturedAt: string;
  }>> {
    // Build search query
    let searchQuery = query ?? "";
    
    // Add tag filters to search query
    if (tags && tags.length > 0) {
      const tagQuery = tags.map(tag => `tags: ${tag}`).join(" OR ");
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