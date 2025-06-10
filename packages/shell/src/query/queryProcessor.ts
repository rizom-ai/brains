import type { ZodType } from "zod";
import type { Logger } from "@brains/utils";
import type { EntityService } from "../entity/entityService";
import type { AIService } from "../ai/aiService";
import type {
  Entity,
  IntentAnalysis,
  QueryOptions,
  QueryResult,
  ModelResponse,
} from "../types";
import type { SearchResult } from "@brains/types";

/**
 * Configuration for QueryProcessor
 */
export interface QueryProcessorConfig {
  entityService: EntityService;
  logger: Logger;
  aiService: AIService;
}

/**
 * Processes queries using the entity model and schema validation
 * Implements Component Interface Standardization pattern
 */
export class QueryProcessor {
  private static instance: QueryProcessor | null = null;

  private readonly entityService: EntityService;
  private readonly logger: Logger;
  private readonly aiService: AIService;

  /**
   * Get the singleton instance of QueryProcessor
   */
  public static getInstance(config: QueryProcessorConfig): QueryProcessor {
    QueryProcessor.instance ??= new QueryProcessor(config);
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
    this.aiService = config.aiService;
  }

  /**
   * Process a query and return structured results
   */
  async processQuery<T = unknown>(
    query: string,
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    this.logger.info("Processing query", {
      queryLength: query.length,
      firstLine: query.split('\n')[0]?.substring(0, 100) + ((query.split('\n')[0]?.length ?? 0) > 100 ? '...' : '')
    });

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

    // 4. Call model with required schema
    const modelResponse = await this.callModel<T>(
      systemPrompt,
      userPrompt,
      options.schema,
    );

    // 5. Return the schema object directly
    return modelResponse.object;
  }

  /**
   * Extract schema name from Zod schema description
   * This allows schemas to hint at which formatter to use
   */
  getSchemaName<T>(schema: ZodType<T>): string | undefined {
    return schema.description;
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
    const entityTypes = this.entityService.getEntityTypes();
    const mentionedTypes = entityTypes.filter((type: string) =>
      lowerQuery.includes(type.toLowerCase()),
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
      excludeTypes: ["generated-content"], // Always exclude generated-content to prevent AI feedback loops
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
      .map((entity) => {
        return `[${entity.entityType}] ${entity.id}\n${entity.content}`;
      })
      .join("\n\n");

    const userPrompt = `${entityContent ? `Context:\n${entityContent}\n\n` : ""}Query: ${query}`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Call the model
   */
  private async callModel<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    schema: ZodType<T>,
  ): Promise<ModelResponse<T>> {
    this.logger.debug("Model call", {
      systemPromptLength: systemPrompt.length,
      userPromptLength: userPrompt.length,
    });

    // Call AI service with structured output
    const result = await this.aiService.generateObject(
      systemPrompt,
      userPrompt,
      schema,
    );

    return {
      object: result.object,
      usage: {
        inputTokens: result.usage.promptTokens,
        outputTokens: result.usage.completionTokens,
      },
    };
  }
}
