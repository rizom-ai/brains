/**
 * Adapters for translating between MCP tool parameters and internal shell APIs
 *
 * This layer ensures clean separation between external (MCP) interfaces
 * and internal implementation details.
 */

import type { QueryProcessor } from "../query/queryProcessor";
import type { QueryOptions, SerializableQueryResult } from "../types";
import type { SchemaRegistry } from "../schema/schemaRegistry";
import type { BrainProtocol } from "../protocol/brainProtocol";
import type { EntityService } from "../entity/entityService";
import { toSerializableQueryResult } from "../utils/serialization";

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
  async executeQuery(params: MCPQueryParams): Promise<SerializableQueryResult> {
    // Translate MCP parameters to internal QueryOptions
    const queryOptions: QueryOptions = {};

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
        if (schema) {
          queryOptions.schema = schema;
        }
      }
    }

    // Execute query with translated options
    const result = await this.queryProcessor.processQuery(
      params.query,
      queryOptions,
    );

    // Convert to serializable format
    return toSerializableQueryResult(result);
  }
}

/**
 * MCP Command parameters
 */
export interface MCPCommandParams {
  command: string;
  args?: unknown[] | undefined;
  context?: Record<string, unknown> | undefined;
}

/**
 * Adapter for BrainProtocol that handles MCP-style parameters
 */
export class BrainProtocolAdapter {
  constructor(private brainProtocol: BrainProtocol) {}

  /**
   * Execute a command with MCP-style parameters
   */
  async executeCommand(params: MCPCommandParams): Promise<unknown> {
    // BrainProtocol expects a Command object with specific structure
    const command = {
      id: `mcp-${Date.now()}`, // Generate a unique ID
      command: params.command,
      args: params.args
        ? // Convert args array to object format
          params.args.reduce<Record<string, unknown>>((acc, arg, index) => {
            acc[`arg${index}`] = arg;
            return acc;
          }, {})
        : undefined,
      context: params.context
        ? {
            // Extract known context fields
            userId:
              typeof params.context["userId"] === "string"
                ? params.context["userId"]
                : undefined,
            conversationId:
              typeof params.context["conversationId"] === "string"
                ? params.context["conversationId"]
                : undefined,
            metadata: params.context,
          }
        : undefined,
    };

    return this.brainProtocol.executeCommand(command);
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
