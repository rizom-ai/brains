# Query Processor as Part of the Shell Application

## Current Role of QueryProcessor

The QueryProcessor currently serves as a critical orchestration component in the BrainProtocol system:

1. It implements the full query processing pipeline:
   - Analyzing profile relevance
   - Retrieving relevant notes
   - Getting conversation history
   - Fetching external sources
   - Formatting prompts
   - Calling models
   - Saving conversation turns

2. It coordinates interactions between multiple contexts:
   - NoteContext
   - ProfileContext
   - ConversationContext
   - ExternalSourceContext

3. It integrates with AI models through the ResourceRegistry

4. It supports schema-based responses using Zod

## Integration with Shell Architecture

The QueryProcessor should be a core component of the shell application for the following reasons:

### 1. Unified Entity Integration

The QueryProcessor provides the perfect integration point for our unified entity model:

```typescript
// Enhanced EntityProcessor in the shell app
export class QueryProcessor implements IQueryProcessor {
  // Core dependencies
  private readonly entityService: EntityService;
  private readonly resourceRegistry: ResourceRegistry;
  private readonly contextRegistry: ContextRegistry;

  // Process query with entity-centric approach
  async processQuery<T = unknown>(
    query: string,
    options?: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    // 1. Analyze query intent to determine relevant entity types
    const intentAnalysis = await this.analyzeQueryIntent(query);

    // 2. Retrieve relevant entities across all registered entity types
    const relevantEntities = await this.entityService.findRelevantEntities(
      query,
      intentAnalysis.entityTypes,
      { limit: 5 },
    );

    // 3. Get conversation history from conversation context
    const conversationContext =
      this.contextRegistry.getContext<IConversationContext>("conversation");
    const history = await conversationContext.getConversationHistory();

    // 4. Format prompt with unified approach
    const { systemPrompt, userPrompt } = this.formatPromptWithEntities(
      query,
      relevantEntities,
      history,
      intentAnalysis,
    );

    // 5. Call model with schema validation
    const modelResponse = await this.callModel<T>(
      systemPrompt,
      userPrompt,
      options?.schema,
    );

    // 6. Process response and save conversation turn
    return this.processAndSaveResponse(
      query,
      modelResponse,
      relevantEntities,
      options,
    );
  }
}
```

### 2. Plugin Architecture Support

The QueryProcessor should be designed to work with the plugin architecture:

```typescript
// Context discovery and integration
export class QueryProcessor implements IQueryProcessor {
  // Initialize with context registry
  constructor(
    private contextRegistry: ContextRegistry,
    private entityService: EntityService,
    private resourceRegistry: ResourceRegistry,
  ) {}

  // Discover and use contexts that implement specific capabilities
  private async getRelevantContextData(
    query: string,
    intentAnalysis: IntentAnalysis,
  ): Promise<ContextData[]> {
    const contexts = this.contextRegistry.getAll();
    const contextData: ContextData[] = [];

    // Get data from each relevant context based on intent
    for (const context of contexts) {
      if (
        context.supports("entitySearch") &&
        intentAnalysis.shouldSearchEntities
      ) {
        const entities = await context.searchEntities(query);
        contextData.push({
          contextType: context.getContextType(),
          entities,
        });
      }

      // Additional capabilities can be checked and used
      if (
        context.supports("externalSearch") &&
        intentAnalysis.shouldSearchExternal
      ) {
        const externalData = await context.searchExternal(query);
        contextData.push({
          contextType: context.getContextType(),
          externalData,
        });
      }
    }

    return contextData;
  }
}
```

### 3. Structured Response Integration

The QueryProcessor should centralize schema handling for all contexts:

```typescript
export class QueryProcessor implements IQueryProcessor {
  // Schema registry for storing and retrieving response schemas
  private schemaRegistry = new SchemaRegistry();

  // Register schema during initialization
  initialize(): void {
    // Register core schemas
    this.schemaRegistry.register("note", noteResponseSchema);
    this.schemaRegistry.register("profile", profileResponseSchema);
    this.schemaRegistry.register("search", searchResponseSchema);

    // Allow contexts to register their schemas
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

  // Call model with appropriate schema based on intent
  private async callModel<T = unknown>(
    systemPrompt: string,
    userPrompt: string,
    providedSchema?: z.ZodType<T>,
    intentAnalysis?: IntentAnalysis,
  ): Promise<ModelResponse<T>> {
    // Use provided schema if available, otherwise use intent-based schema
    const schema =
      providedSchema ||
      (intentAnalysis && this.schemaRegistry.get(intentAnalysis.primaryIntent));

    const claude = this.resourceRegistry.getClaudeModel();
    return claude.complete({
      systemPrompt,
      userPrompt,
      schema,
    });
  }
}
```

### 4. Entity-Centric Processing

The QueryProcessor should leverage our unified entity model:

```typescript
export class QueryProcessor implements IQueryProcessor {
  // Process entities through the unified entity service
  private async processEntities(
    query: string,
    entityType?: string,
  ): Promise<Entity[]> {
    const entityTypes = entityType
      ? [entityType]
      : this.entityService.getSupportedEntityTypes();

    const entities = await this.entityService.searchEntities(query, {
      entityTypes,
      limit: 5,
      includeEmbeddings: true,
      includeMetadata: true,
    });

    return this.entityService.rankEntitiesByRelevance(entities, query);
  }

  // Format entities for prompt context
  private formatEntitiesForPrompt(entities: Entity[]): string {
    return entities
      .map((entity) => {
        // Use the entity adapter to format the entity
        const adapter = this.entityService.getAdapterForType(entity.type);
        return adapter.formatForPrompt(entity);
      })
      .join("\n\n");
  }
}
```

## Sample Implementation

```typescript
/**
 * QueryProcessor for the Shell Application
 *
 * Coordinates the complete query processing pipeline with a plugin architecture
 * and unified entity model approach. This forms a core part of the shell
 * application and serves as the integration point for all plugin contexts.
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
  public static getInstance(config: QueryProcessorConfig): QueryProcessor {
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
  public static createFresh(config: QueryProcessorConfig): QueryProcessor {
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
```

## Relationship with EntityService

In our new architecture, the QueryProcessor works closely with the EntityService:

1. **EntityService** handles:
   - Entity storage, retrieval, and indexing
   - Entity embedding and similarity search
   - Entity metadata extraction and tagging
   - Entity validation and transformation

2. **QueryProcessor** handles:
   - Query intent analysis
   - Coordinating entity retrieval across contexts
   - Prompt formatting with entity data
   - Calling the AI model with appropriate schemas
   - Processing model responses
   - Saving conversation history

This separation of concerns provides a clean architecture while maintaining the core functionality of the current QueryProcessor.

## Implementation Plan

1. Start by implementing the core QueryProcessor in the shell app
2. Create interfaces for required dependencies (EntityService, ContextRegistry)
3. Implement a simple SchemaRegistry for response schema management
4. Create a basic implementation of entity-based prompt formatting
5. Integrate with the AI model through ResourceRegistry
6. Build the query processing pipeline with plugin support
7. Add type safety with comprehensive Zod schemas

The QueryProcessor serves as a critical orchestration component in our shell app, providing the integration points for our plugin architecture while centralizing the query processing logic.
