/**
 * Adapters for translating between MCP tool parameters and internal shell APIs
 *
 * This layer ensures clean separation between external (MCP) interfaces
 * and internal implementation details.
 */

import type { QueryProcessor } from "../query/queryProcessor";
import type { QueryOptions } from "../types";
import type { SchemaRegistry } from "../schema/schemaRegistry";
import type { EntityService } from "../entity/entityService";
import type { ContentGenerationService } from "../content/contentGenerationService";
import type {
  ContentGenerateOptions,
  GeneratedContent,
  BaseEntity,
} from "@brains/types";
import { defaultQueryResponseSchema } from "../schemas/defaults";

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
 * Adapter for QueryProcessor that handles MCP-style parameters
 */
export class QueryProcessorAdapter {
  constructor(
    private queryProcessor: QueryProcessor,
    private schemaRegistry: SchemaRegistry,
  ) {}

  /**
   * Execute a query with MCP-style parameters
   */
  async executeQuery(params: MCPQueryParams): Promise<unknown> {
    // Translate MCP parameters to internal QueryOptions
    const queryOptions: QueryOptions<unknown> = {
      schema: defaultQueryResponseSchema, // Default schema, may be overridden below
    };

    if (params.options) {
      // Handle context - extract known fields
      if (params.options.context) {
        const { userId, conversationId, ...metadata } = params.options.context;

        if (typeof userId === "string") {
          queryOptions.userId = userId;
        }

        if (typeof conversationId === "string") {
          queryOptions.conversationId = conversationId;
        }

        // Put remaining context and MCP-specific options in metadata
        queryOptions.metadata = {
          ...metadata,
          limit: params.options.limit,
          requestedSchema: params.options.responseSchema,
        };
      } else {
        // Just MCP options without context
        queryOptions.metadata = {
          limit: params.options.limit,
          requestedSchema: params.options.responseSchema,
        };
      }

      // Handle response schema
      if (params.options.responseSchema) {
        const schema = this.schemaRegistry.get(params.options.responseSchema);
        queryOptions.schema = schema ?? defaultQueryResponseSchema;
      } else {
        queryOptions.schema = defaultQueryResponseSchema;
      }
    } else {
      // No options provided, use default schema
      queryOptions.schema = defaultQueryResponseSchema;
    }

    // Execute query with translated options
    return this.queryProcessor.processQuery(params.query, queryOptions);
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
      throw new Error(`Entity not found: ${entityType}/${entityId}`);
    }
    return entity;
  }
}

/**
 * MCP Content generation with template parameters
 */
export interface MCPGenerateFromTemplateParams {
  templateName: string;
  prompt: string;
  context?:
    | {
        data?: Record<string, unknown> | undefined;
        style?: string | undefined;
      }
    | undefined;
}

/**
 * Adapter for ContentGenerationService that provides MCP interface
 */
export class ContentGenerationAdapter {
  constructor(
    private contentGenerationService: ContentGenerationService,
    private schemaRegistry: SchemaRegistry,
    private entityService: EntityService,
  ) {}

  /**
   * Generate content with MCP-style parameters
   */
  async generateContent(params: {
    prompt: string;
    schemaName: string;
    context?:
      | {
          entities?: BaseEntity[] | undefined;
          data?: Record<string, unknown> | undefined;
          examples?: unknown[] | undefined;
          style?: string | undefined;
        }
      | undefined;
    save?: boolean | undefined;
    contentType?: string | undefined;
  }): Promise<unknown> {
    // Get schema from registry
    const schema = this.schemaRegistry.get(params.schemaName);
    if (!schema) {
      throw new Error(`Schema not found: ${params.schemaName}`);
    }

    // Build the options object for content generation
    const generateOptions: ContentGenerateOptions<unknown> = {
      schema,
      prompt: params.prompt,
    };

    // Clean up context to remove undefined values
    if (params.context) {
      const cleanContext: ContentGenerateOptions<unknown>["context"] = {};

      if (params.context.entities !== undefined) {
        cleanContext.entities = params.context.entities;
      }
      if (params.context.data !== undefined) {
        cleanContext.data = params.context.data;
      }
      if (params.context.examples !== undefined) {
        cleanContext.examples = params.context.examples;
      }
      if (params.context.style !== undefined) {
        cleanContext.style = params.context.style;
      }

      if (Object.keys(cleanContext).length > 0) {
        generateOptions.context = cleanContext;
      }
    }

    // Call content generation service
    const content =
      await this.contentGenerationService.generate(generateOptions);

    // Save as generated-content entity if requested
    if (params.save) {
      return this.saveGeneratedContent(
        content,
        params.prompt,
        params.schemaName,
        params.contentType,
        params.context,
      );
    }

    return content;
  }

  /**
   * Save generated content as an entity
   */
  private async saveGeneratedContent(
    content: unknown,
    prompt: string,
    schemaName: string,
    contentType?: string,
    context?: unknown,
  ): Promise<{ content: unknown; entityId: string; message: string }> {
    const entity = await this.entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: contentType ?? schemaName,
      schemaName: schemaName,
      data: content as Record<string, unknown>,
      content: JSON.stringify(content, null, 2),
      metadata: {
        prompt,
        context,
        generatedAt: new Date().toISOString(),
        generatedBy: "claude-3-sonnet",
        regenerated: false,
      },
    });

    return {
      content,
      entityId: entity.id,
      message: `Generated and saved as entity ${entity.id}`,
    };
  }

  /**
   * Generate content from a template
   */
  async generateFromTemplate(
    params: MCPGenerateFromTemplateParams,
  ): Promise<unknown> {
    // Build the options object - starting with required prompt
    const options: Omit<ContentGenerateOptions<unknown>, "schema"> = {
      prompt: params.prompt,
    };

    // Only add context if it exists and has defined values
    if (params.context) {
      const context: ContentGenerateOptions<unknown>["context"] = {};

      if (params.context.data !== undefined) {
        context.data = params.context.data;
      }
      if (params.context.style !== undefined) {
        context.style = params.context.style;
      }

      // Only set context if it has at least one property
      if (Object.keys(context).length > 0) {
        options.context = context;
      }
    }

    return this.contentGenerationService.generateFromTemplate(
      params.templateName,
      options,
    );
  }

  /**
   * List available templates
   */
  async listTemplates(): Promise<Array<{ name: string; description: string }>> {
    const templates = this.contentGenerationService.listTemplates();
    return templates.map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  /**
   * Promote generated content to a target entity type
   */
  async promoteGeneratedContent(params: {
    generatedContentId: string;
    targetEntityType: string;
    additionalFields?: Record<string, unknown> | undefined;
    deleteOriginal?: boolean | undefined;
  }): Promise<{
    promotedId: string;
    promotedType: string;
    message: string;
  }> {
    const promoted = await this.entityService.deriveEntity(
      params.generatedContentId,
      "generated-content",
      params.targetEntityType,
      params.additionalFields,
      params.deleteOriginal
        ? { deleteSource: params.deleteOriginal }
        : undefined,
    );

    return {
      promotedId: promoted.id,
      promotedType: promoted.entityType,
      message: `Promoted to ${promoted.entityType}: ${promoted.id}`,
    };
  }
}
