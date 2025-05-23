import type { z } from "zod";
import type { Logger } from "../utils/logger";
import type { EntityService } from "../entity/entityService";
import type {
  Entity,
  Citation,
  IntentAnalysis,
  QueryOptions,
  QueryResult,
  ModelResponse,
  SearchResult,
} from "../types";

/**
 * Configuration for QueryProcessor
 */
export interface QueryProcessorConfig {
  entityService: EntityService;
  logger: Logger;
}

/**
 * Processes queries using the entity model and schema validation
 * Implements Component Interface Standardization pattern
 */
export class QueryProcessor {
  private static instance: QueryProcessor | null = null;

  private readonly entityService: EntityService;
  private readonly logger: Logger;

  /**
   * Get the singleton instance of QueryProcessor
   */
  public static getInstance(config: QueryProcessorConfig): QueryProcessor {
    if (!QueryProcessor.instance) {
      QueryProcessor.instance = new QueryProcessor(config);
    }
    return QueryProcessor.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    QueryProcessor.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(config: QueryProcessorConfig): QueryProcessor {
    return new QueryProcessor(config);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(config: QueryProcessorConfig) {
    this.entityService = config.entityService;
    this.logger = config.logger;
  }

  /**
   * Process a query and return structured results
   */
  async processQuery<T = unknown>(
    query: string,
    options?: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    this.logger.info(`Processing query: ${query}`);

    // 1. Analyze query intent
    const intentAnalysis = await this.analyzeQueryIntent(query);

    // 2. Search for relevant entities
    const relevantEntities = await this.searchEntities(query, intentAnalysis);

    // 3. Format prompt with entities
    const { systemPrompt, userPrompt } = this.formatPrompt(
      query,
      relevantEntities,
      intentAnalysis,
    );

    // 4. Call model (simplified for now - would integrate with actual model)
    const modelResponse = await this.callModel<T>(
      systemPrompt,
      userPrompt,
      options?.schema,
    );

    // 5. Process response into result
    return this.processModelResponse<T>(modelResponse, relevantEntities);
  }

  /**
   * Analyze the intent of a query
   */
  private async analyzeQueryIntent(query: string): Promise<IntentAnalysis> {
    // Simple intent analysis - in production would use NLP
    const lowerQuery = query.toLowerCase();
    
    let primaryIntent = "search";
    if (lowerQuery.includes("create") || lowerQuery.includes("new")) {
      primaryIntent = "create";
    } else if (lowerQuery.includes("update") || lowerQuery.includes("edit")) {
      primaryIntent = "update";
    }

    // Determine entity types from query
    const entityTypes = this.entityService.getAllEntityTypes();
    const mentionedTypes = entityTypes.filter((type: string) => 
      lowerQuery.includes(type.toLowerCase())
    );

    return {
      primaryIntent,
      entityTypes: mentionedTypes.length > 0 ? mentionedTypes : entityTypes,
      shouldSearchExternal: false,
      confidenceScore: 0.8,
    };
  }

  /**
   * Search for entities relevant to the query
   */
  private async searchEntities(
    query: string,
    intentAnalysis: IntentAnalysis,
  ): Promise<Entity[]> {
    const results = await this.entityService.search(query, {
      types: intentAnalysis.entityTypes,
      limit: 5,
      offset: 0,
      sortBy: "relevance" as const,
      sortDirection: "desc" as const,
    });

    return results.map((result: SearchResult) => result.entity);
  }

  /**
   * Format prompt for model
   */
  private formatPrompt(
    query: string,
    entities: Entity[],
    intentAnalysis: IntentAnalysis,
  ): { systemPrompt: string; userPrompt: string } {
    const systemPrompt = `You are a helpful assistant with access to the user's personal knowledge base.
Provide accurate responses based on the available information.
Intent: ${intentAnalysis.primaryIntent}`;

    const entityContent = entities
      .map(entity => {
        return `[${entity.entityType}] ${entity.title}\n${entity.content}`;
      })
      .join("\n\n");

    const userPrompt = `${entityContent ? `Context:\n${entityContent}\n\n` : ""}Query: ${query}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Call the model (placeholder implementation)
   */
  private async callModel<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    schema?: z.ZodType<T>,
  ): Promise<ModelResponse<T>> {
    this.logger.debug("Model call", { systemPrompt, userPrompt });

    // Placeholder response - would integrate with actual model
    const response = {
      text: "This is a placeholder response.",
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    };

    if (schema) {
      // Validate against schema if provided
      try {
        // Create a mock object that satisfies the schema
        const object = schema.parse({
          summary: "This is a placeholder summary",
          topics: ["placeholder"],
        });
        return { ...response, object };
      } catch (error) {
        this.logger.warn("Schema validation failed", error);
      }
    }

    return response;
  }

  /**
   * Process model response into query result
   */
  private processModelResponse<T = unknown>(
    modelResponse: ModelResponse<T>,
    entities: Entity[],
  ): QueryResult<T> {
    // Create citations from entities
    const citations: Citation[] = entities.map(entity => ({
      entityId: entity.id,
      entityType: entity.entityType,
      entityTitle: entity.title,
      excerpt: this.truncateContent(entity.content, 150),
    }));

    const result: QueryResult<T> = {
      answer: modelResponse.text ?? "",
      citations,
      relatedEntities: entities,
    };

    if (modelResponse.object !== undefined) {
      result.object = modelResponse.object;
    }

    return result;
  }

  /**
   * Truncate content to specified length
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    const truncated = content.slice(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");
    
    return lastSpace > 0
      ? `${content.slice(0, lastSpace)}...`
      : `${truncated}...`;
  }
}