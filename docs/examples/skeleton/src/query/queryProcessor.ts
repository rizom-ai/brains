/**
 * QueryProcessor for the Skeleton Application
 *
 * Coordinates the complete query processing pipeline with a plugin architecture
 * and unified entity model approach. This forms a core part of the skeleton
 * application and serves as the integration point for all plugin contexts.
 */
import { z } from "zod";
import { Logger } from "../../utils/logger";
import { EntityService } from "../entity/entityService";
import { ResourceRegistry } from "../../resources/resourceRegistry";
import { ContextRegistry } from "../context/contextRegistry";
import { SchemaRegistry } from "../schema/schemaRegistry";
import { searchResponseSchema } from "./schemas/searchResponseSchema";
import { createResponseSchema } from "./schemas/createResponseSchema";
import { updateResponseSchema } from "./schemas/updateResponseSchema";
import {
  Entity,
  Citation,
  IntentAnalysis,
  QueryOptions,
  QueryResult,
  ModelResponse,
  IQueryProcessor,
  IConversationContext,
} from "../types";

/**
 * Configuration options for QueryProcessor
 */
export interface QueryProcessorConfig {
  /** Entity service for unified entity operations */
  entityService?: EntityService;
  /** Resource registry for AI models and other resources */
  resourceRegistry?: ResourceRegistry;
  /** Context registry for accessing plugin contexts */
  contextRegistry?: ContextRegistry;
}

/**
 * QueryProcessor implementation
 *
 * Manages the full query processing pipeline using the unified entity model and plugin architecture
 */
export class QueryProcessor implements IQueryProcessor {
  private static instance: QueryProcessor | null = null;

  // Core dependencies
  private readonly entityService: EntityService;
  private readonly resourceRegistry: ResourceRegistry;
  private readonly contextRegistry: ContextRegistry;
  private readonly schemaRegistry: SchemaRegistry;
  private readonly logger: Logger;

  /**
   * Get singleton instance
   */
  public static getInstance(config: QueryProcessorConfig = {}): QueryProcessor {
    if (!QueryProcessor.instance) {
      QueryProcessor.instance = new QueryProcessor(config);
    }
    return QueryProcessor.instance;
  }

  /**
   * Reset instance for testing
   */
  public static resetInstance(): void {
    QueryProcessor.instance = null;
  }

  /**
   * Create fresh instance
   */
  public static createFresh(config: QueryProcessorConfig = {}): QueryProcessor {
    return new QueryProcessor(config);
  }

  /**
   * Private constructor
   */
  private constructor(config: QueryProcessorConfig) {
    this.entityService = config.entityService || EntityService.getInstance();
    this.resourceRegistry =
      config.resourceRegistry || ResourceRegistry.getInstance();
    this.contextRegistry =
      config.contextRegistry || ContextRegistry.getInstance();
    this.schemaRegistry = new SchemaRegistry();
    this.logger = Logger.getInstance();

    this.initialize();
  }

  /**
   * Initialize the processor
   */
  private initialize(): void {
    // Register core schemas
    this.registerCoreSchemas();

    // Allow contexts to register their schemas
    this.registerContextSchemas();
  }

  /**
   * Process a query
   */
  async processQuery<T = unknown>(
    query: string,
    options?: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    // 1. Analyze query intent to determine relevant entity types
    const intentAnalysis = await this.analyzeQueryIntent(query);

    // 2. Retrieve relevant entities
    const relevantEntities = await this.retrieveRelevantEntities(
      query,
      intentAnalysis,
    );

    // 3. Get conversation history
    const history = await this.getConversationHistory(options?.conversationId);

    // 4. Format prompt
    const { systemPrompt, userPrompt } = this.formatPrompt(
      query,
      relevantEntities,
      history,
      intentAnalysis,
    );

    // 5. Call model with schema validation
    const modelResponse = await this.callModel<T>(
      systemPrompt,
      userPrompt,
      options?.schema || this.getSchemaForIntent(intentAnalysis),
    );

    // 6. Process response
    const result = this.processModelResponse<T>(
      modelResponse,
      relevantEntities,
    );

    // 7. Save conversation turn
    await this.saveConversationTurn(query, result.answer, options);

    return result;
  }

  /**
   * Analyze query intent
   */
  private async analyzeQueryIntent(query: string): Promise<IntentAnalysis> {
    // Implementation will analyze the query to determine:
    // - Primary intent (e.g., "search", "create", "update")
    // - Relevant entity types (e.g., "note", "profile", "conversation")
    // - Search parameters (e.g., tags, date ranges, content types)

    // This provides a unified approach to query processing
    // across all contexts and entity types

    // For now, a simplified implementation
    return {
      primaryIntent: "search",
      entityTypes: ["note", "profile"],
      shouldSearchExternal:
        query.includes("news") || query.includes("current events"),
      confidenceScore: 0.9,
    };
  }

  /**
   * Retrieve relevant entities
   */
  private async retrieveRelevantEntities(
    query: string,
    intentAnalysis: IntentAnalysis,
  ): Promise<Entity[]> {
    return this.entityService.searchEntities(query, {
      entityTypes: intentAnalysis.entityTypes,
      limit: 5,
    });
  }

  /**
   * Get conversation history
   */
  private async getConversationHistory(
    conversationId?: string,
  ): Promise<string> {
    // Get conversation context
    const conversationContext =
      this.contextRegistry.getContext<IConversationContext>("conversation");
    if (!conversationContext) {
      return "";
    }

    // Get history
    return conversationContext.getConversationHistory(conversationId);
  }

  /**
   * Format prompt with entities
   */
  private formatPrompt(
    query: string,
    entities: Entity[],
    history: string,
    intentAnalysis: IntentAnalysis,
  ): { systemPrompt: string; userPrompt: string } {
    // Format system prompt
    const systemPrompt = `You are a helpful assistant with access to the user's personal knowledge base.
Your goal is to provide accurate, helpful responses based on the user's data.
${intentAnalysis.primaryIntent === "search" ? "Focus on providing information from the relevant entities." : ""}
${intentAnalysis.primaryIntent === "create" ? "Help the user create high-quality content." : ""}`;

    // Format user prompt
    const entityContent = this.formatEntitiesForPrompt(entities);
    const userPrompt = `
${history ? `Conversation history:\n${history}\n\n` : ""}
${entityContent ? `Relevant information:\n${entityContent}\n\n` : ""}
User query: ${query}
`;

    return { systemPrompt, userPrompt };
  }

  /**
   * Format entities for prompt
   */
  private formatEntitiesForPrompt(entities: Entity[]): string {
    return entities
      .map((entity) => {
        // Use the entity adapter to format the entity
        const adapter = this.entityService.getAdapterForType(entity.type);
        return adapter.formatForPrompt(entity);
      })
      .join("\n\n");
  }

  /**
   * Call the model
   */
  private async callModel<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    schema?: z.ZodType<T>,
  ): Promise<ModelResponse<T>> {
    const claude = this.resourceRegistry.getClaudeModel();
    return claude.complete({
      systemPrompt,
      userPrompt,
      schema,
    });
  }

  /**
   * Process model response
   */
  private processModelResponse<T = unknown>(
    modelResponse: ModelResponse<T>,
    relevantEntities: Entity[],
  ): QueryResult<T> {
    // Extract answer text
    const answer = this.extractAnswerFromResponse(modelResponse);

    // Create citations from relevant entities
    const citations = this.createCitationsFromEntities(relevantEntities);

    // Return query result
    return {
      answer,
      citations,
      object: modelResponse.object as T,
      relatedEntities: this.getRelatedEntities(relevantEntities),
    };
  }

  /**
   * Save conversation turn
   */
  private async saveConversationTurn(
    query: string,
    response: string,
    options?: QueryOptions<unknown>,
  ): Promise<void> {
    const conversationContext =
      this.contextRegistry.getContext<IConversationContext>("conversation");
    if (!conversationContext) {
      return;
    }

    await conversationContext.saveTurn(query, response, {
      userId: options?.userId,
      metadata: options?.metadata,
    });
  }

  /**
   * Register core schemas
   */
  private registerCoreSchemas(): void {
    // Register common schemas for structured responses
    this.schemaRegistry.register("search", searchResponseSchema);
    this.schemaRegistry.register("create", createResponseSchema);
    this.schemaRegistry.register("update", updateResponseSchema);
  }

  /**
   * Register schemas from contexts
   */
  private registerContextSchemas(): void {
    const contexts = this.contextRegistry.getAll();
    for (const context of contexts) {
      if (context.supports("schemaRegistration")) {
        const schemas = context.getSchemas();
        for (const [name, schema] of Object.entries(schemas)) {
          this.schemaRegistry.register(
            `${context.getContextType()}.${name}`,
            schema,
          );
        }
      }
    }
  }

  /**
   * Get schema for intent
   */
  private getSchemaForIntent(
    intentAnalysis: IntentAnalysis,
  ): z.ZodType<unknown> | undefined {
    return this.schemaRegistry.get(intentAnalysis.primaryIntent);
  }

  /**
   * Extract answer from response
   */
  private extractAnswerFromResponse<T>(response: ModelResponse<T>): string {
    if (
      response.object &&
      typeof response.object === "object" &&
      "answer" in response.object
    ) {
      return String(response.object.answer);
    }
    return "";
  }

  /**
   * Create citations from entities
   */
  private createCitationsFromEntities(entities: Entity[]): Citation[] {
    return entities.map((entity) => ({
      entityId: entity.id,
      entityType: entity.type,
      entityTitle: entity.title || "Untitled",
      excerpt: this.truncateContent(entity.content || "", 150),
    }));
  }

  /**
   * Get related entities
   */
  private getRelatedEntities(entities: Entity[]): Entity[] {
    // Implement related entity fetching
    // This would use similarity search to find entities related to the most relevant entity
    if (entities.length === 0) {
      return [];
    }

    // Use the most relevant entity to find related ones
    const primaryEntity = entities[0];

    // This would be replaced with actual implementation
    return [];
  }

  /**
   * Truncate content
   */
  private truncateContent(content: string, maxLength: number): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Find last complete sentence or word boundary
    const truncated = content.slice(0, maxLength);
    const lastPeriod = truncated.lastIndexOf(".");
    const lastSpace = truncated.lastIndexOf(" ");

    const breakPoint = lastPeriod > 0 ? lastPeriod + 1 : lastSpace;
    return breakPoint > 0
      ? `${content.slice(0, breakPoint)}...`
      : `${truncated}...`;
  }
}
