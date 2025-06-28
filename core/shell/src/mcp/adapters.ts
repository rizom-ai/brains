/**
 * Adapters for translating between MCP tool parameters and internal shell APIs
 *
 * This layer ensures clean separation between external (MCP) interfaces
 * and internal implementation details.
 */

import type { EntityService } from "@brains/entity-service";
import type { ContentGenerator } from "@brains/content-generator";
import type { GenerationContext } from "@brains/types";
import { ServiceError } from "@brains/utils";

/**
 * MCP Query parameters (what users provide via MCP tools)
 */
export interface MCPQueryParams {
  query: string;
  options?:
    | {
        limit?: number | undefined;
        context?: Record<string, unknown> | undefined;
        responseSchema?: string | undefined;
      }
    | undefined;
}

/**
 * Adapter for ContentGenerator that handles MCP-style parameters
 */
export class ContentGeneratorAdapter {
  constructor(private contentGenerator: ContentGenerator) {}

  /**
   * Execute a query with MCP-style parameters using knowledge query template
   */
  async executeQuery(params: MCPQueryParams): Promise<unknown> {
    // Use the system knowledge query template
    const templateName = "shell:knowledge-query";

    // Build generation context
    const context: GenerationContext = {
      prompt: params.query,
      data: {
        limit: params.options?.limit || 10,
        responseSchema: params.options?.responseSchema || "default-query",
        context: params.options?.context || {},
      },
    };

    // Execute query using ContentGenerator with knowledge query template
    return this.contentGenerator.generateContent(templateName, context);
  }
}

/**
 * MCP Entity search parameters
 */
export interface MCPEntitySearchParams {
  entityType: string;
  query: string;
  limit?: number | undefined;
}

/**
 * Adapter for EntityService that provides a cleaner MCP interface
 */
export class EntityServiceAdapter {
  constructor(private entityService: EntityService) {}

  /**
   * Search entities with MCP-style parameters
   */
  async searchEntities(params: MCPEntitySearchParams): Promise<unknown[]> {
    return this.entityService.searchEntities(
      params.entityType,
      params.query,
      params.limit ? { limit: params.limit } : undefined,
    );
  }

  /**
   * Get entity by type and ID
   */
  async getEntity(entityType: string, entityId: string): Promise<unknown> {
    const entity = await this.entityService.getEntity(entityType, entityId);
    if (!entity) {
      throw new ServiceError(
        "entity",
        "retrieval",
        `Entity not found: ${entityType}/${entityId}`,
      );
    }
    return entity;
  }
}

/**
 * MCP Content generation with template parameters
 */
export interface MCPGenerateFromTemplateParams {
  contentType: string;
  prompt: string;
  context?:
    | {
        data?: Record<string, unknown> | undefined;
        style?: string | undefined;
      }
    | undefined;
}

/**
 * Adapter for ContentGenerator that provides MCP interface
 */
export class ContentGenerationAdapter {
  constructor(private contentGenerator: ContentGenerator) {}

  /**
   * Generate content with MCP-style parameters
   */
  async generateContent(params: {
    prompt: string;
    contentType: string;
    context?: {
      data?: Record<string, unknown>;
    };
  }): Promise<unknown> {
    // Use contentType as template name
    const templateName = params.contentType;

    // Build generation context
    const context: GenerationContext = {
      prompt: params.prompt,
      data: params.context?.data || {},
    };

    // Call ContentGenerator with template-based approach
    return this.contentGenerator.generateContent(templateName, context);
  }

  /**
   * Generate content from a template
   */
  async generateFromTemplate(
    params: MCPGenerateFromTemplateParams,
  ): Promise<unknown> {
    // Use contentType as template name
    const templateName = params.contentType;

    // Build generation context
    const context: GenerationContext = {
      prompt: params.prompt,
      data: params.context?.data || {},
    };

    return this.contentGenerator.generateContent(templateName, context);
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<Array<{ name: string; description: string }>> {
    const templates = this.contentGenerator.listTemplates();
    return templates.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }
}
