import type {
  ContentTemplate,
  RouteDefinition,
  SectionDefinition,
  Logger,
  EntityService,
  AIService,
  SearchResult,
  BaseEntity,
  QueryOptions,
  QueryResult,
} from "@brains/types";

/**
 * Progress information for content generation operations
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
}

/**
 * Dependencies required by ContentGenerator
 */
export interface ContentGeneratorDependencies {
  generateWithTemplate: (
    template: ContentTemplate,
    context: GenerationContext,
  ) => Promise<unknown>;
  getTemplate: (name: string) => ContentTemplate | null;
  listRoutes: () => RouteDefinition[];
  logger: Logger;
  // Knowledge-aware generation dependencies from QueryProcessor
  entityService: EntityService;
  aiService: AIService;
}

/**
 * Context for content generation
 */
export interface GenerationContext {
  prompt?: string;
  data?: Record<string, unknown>;
}

/**
 * Content Generator
 *
 * Provides centralized content generation functionality with template-based approach.
 * Implements Component Interface Standardization pattern.
 */
export class ContentGenerator {
  private static instance: ContentGenerator | null = null;
  private static readonly TEMPLATE_NAMESPACE = "site-builder:";
  
  // Template registry for local template management
  private templates: Map<string, ContentTemplate<unknown>> = new Map();

  /**
   * Get the singleton instance of ContentGenerator
   */
  public static getInstance(
    dependencies: ContentGeneratorDependencies,
  ): ContentGenerator {
    ContentGenerator.instance ??= new ContentGenerator(dependencies);
    return ContentGenerator.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ContentGenerator.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    dependencies: ContentGeneratorDependencies,
  ): ContentGenerator {
    return new ContentGenerator(dependencies);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    private readonly dependencies: ContentGeneratorDependencies,
  ) {}

  /**
   * Register a reusable template
   */
  registerTemplate<T>(name: string, template: ContentTemplate<T>): void {
    // When storing in a heterogeneous map, we lose specific type information
    // This is safe because templates are retrieved by name and used with appropriate types
    this.templates.set(name, template as ContentTemplate<unknown>);
  }

  /**
   * Get a registered template (checks local registry first, then dependencies)
   */
  getTemplate(name: string): ContentTemplate<unknown> | null {
    // Check local registry first
    const localTemplate = this.templates.get(name);
    if (localTemplate) {
      return localTemplate;
    }
    
    // Fall back to dependencies
    return this.dependencies.getTemplate(name);
  }

  /**
   * List all available templates (local + dependency templates)
   */
  listTemplates(): ContentTemplate<unknown>[] {
    const localTemplates = Array.from(this.templates.values());
    // Note: We don't have a way to list dependency templates, so just return local ones
    return localTemplates;
  }

  /**
   * Generate content using a template
   */
  async generateContent(
    templateName: string,
    context: GenerationContext = {},
  ): Promise<string> {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Build enhanced prompt with context
    const enhancedPrompt = this.buildPrompt(template, context);

    // Generate content using template
    const templateContext: GenerationContext = {
      prompt: enhancedPrompt,
    };

    if (context.data !== undefined) {
      templateContext.data = context.data;
    }

    const generatedContent = await this.dependencies.generateWithTemplate(
      template,
      templateContext,
    );

    // Format content using template's formatter
    return this.formatContent(template, generatedContent);
  }

  /**
   * Convenience method for route-based content generation
   */
  async generateWithRoute(
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: ProgressInfo,
    additionalContext: Record<string, unknown> = {},
  ): Promise<string> {
    if (!section.template) {
      throw new Error(`No template specified for section ${section.id}`);
    }

    const templateName = this.resolveTemplateName(section.template);

    const context: GenerationContext = {
      data: {
        pageTitle: route.title,
        pageDescription: route.description,
        sectionId: section.id,
        progressInfo: {
          currentSection: progressInfo.current,
          totalSections: progressInfo.total,
          processingStage: progressInfo.message,
        },
        ...additionalContext,
      },
    };

    return this.generateContent(templateName, context);
  }

  /**
   * Regenerate content for a specific entity
   */
  async regenerateContent(
    entityType: string,
    page: string,
    section: string,
    mode: "leave" | "new" | "with-current",
    progressInfo: ProgressInfo,
    currentContent?: string,
  ): Promise<{ entityId: string; content: string }> {
    // Find the template for this page/section
    const { template, templateName } = this.findTemplateForEntity(
      page,
      section,
    );

    // Prepare the prompt based on mode
    let effectivePrompt = template.basePrompt;
    if (mode === "with-current" && currentContent) {
      effectivePrompt = `${template.basePrompt}\n\nCurrent content to improve:\n${currentContent}`;
    }

    const context: GenerationContext = {
      prompt: effectivePrompt,
      data: {
        pageTitle: page,
        sectionId: section,
        regenerationMode: mode,
        progressInfo: {
          currentSection: progressInfo.current,
          totalSections: progressInfo.total,
          processingStage: progressInfo.message,
        },
      },
    };

    const content = await this.generateContent(templateName, context);

    return {
      entityId: `${entityType}:${page}:${section}`,
      content,
    };
  }

  /**
   * Process a query with entity awareness (from QueryProcessor)
   */
  async processQuery<T = unknown>(
    query: string,
    options: QueryOptions<T>,
  ): Promise<QueryResult<T>> {
    this.dependencies.logger.info("Processing query", {
      queryLength: query.length,
      firstLine:
        query.split("\n")[0]?.substring(0, 100) +
        ((query.split("\n")[0]?.length ?? 0) > 100 ? "..." : ""),
    });

    // 1. Analyze query intent
    const intentAnalysis = await this.analyzeQueryIntent(query);

    // 2. Search for relevant entities
    const relevantEntities = await this.searchEntities(query, intentAnalysis);

    // 3. Format prompt with entities
    const { systemPrompt, userPrompt } = this.formatQueryPrompt(
      query,
      relevantEntities,
      intentAnalysis,
    );

    // 4. Call model with required schema
    const result = await this.dependencies.aiService.generateObject(
      systemPrompt,
      userPrompt,
      options.schema,
    );

    // 5. Return the schema object directly
    return result.object;
  }

  /**
   * Analyze the intent of a query (from QueryProcessor)
   */
  private async analyzeQueryIntent(query: string): Promise<{
    primaryIntent: string;
    entityTypes: string[];
    shouldSearchExternal: boolean;
    confidenceScore: number;
  }> {
    // Simple intent analysis - in production would use NLP
    const lowerQuery = query.toLowerCase();

    let primaryIntent = "search";
    if (lowerQuery.includes("create") || lowerQuery.includes("new")) {
      primaryIntent = "create";
    } else if (lowerQuery.includes("update") || lowerQuery.includes("edit")) {
      primaryIntent = "update";
    }

    // Determine entity types from query
    const entityTypes = this.dependencies.entityService.getEntityTypes();
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
   * Search for entities relevant to the query (from QueryProcessor)
   */
  private async searchEntities(
    query: string,
    intentAnalysis: {
      primaryIntent: string;
      entityTypes: string[];
      shouldSearchExternal: boolean;
      confidenceScore: number;
    },
  ): Promise<BaseEntity[]> {
    const results = await this.dependencies.entityService.search(query, {
      types: intentAnalysis.entityTypes,
      limit: 5,
      offset: 0,
    });

    return results.map((result: SearchResult) => result.entity);
  }

  /**
   * Format prompt for query processing (from QueryProcessor)
   */
  private formatQueryPrompt(
    query: string,
    entities: BaseEntity[],
    intentAnalysis: {
      primaryIntent: string;
      entityTypes: string[];
      shouldSearchExternal: boolean;
      confidenceScore: number;
    },
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
   * Resolve template name with namespace prefix
   */
  private resolveTemplateName(template: string): string {
    return template.includes(":")
      ? template
      : `${ContentGenerator.TEMPLATE_NAMESPACE}${template}`;
  }

  /**
   * Find template for a specific entity by page and section
   */
  private findTemplateForEntity(
    page: string,
    section: string,
  ): { template: ContentTemplate; templateName: string } {
    const routes = this.dependencies.listRoutes();

    for (const route of routes) {
      if (route.id === page) {
        const matchingSection = route.sections.find((s) => s.id === section);
        if (matchingSection?.template) {
          const templateName = this.resolveTemplateName(
            matchingSection.template,
          );
          const template = this.dependencies.getTemplate(templateName);

          if (!template) {
            throw new Error(
              `Template not found for page: ${page}, section: ${section}`,
            );
          }

          return { template, templateName };
        }
      }
    }

    throw new Error(
      `Template not found for page: ${page}, section: ${section}`,
    );
  }

  /**
   * Build enhanced prompt with context from ContentGenerationService
   */
  private buildPrompt(
    template: ContentTemplate,
    context: GenerationContext,
  ): string {
    let prompt = template.basePrompt;

    // Add additional instructions if provided
    if (context.prompt) {
      prompt = `${prompt}\n\nAdditional instructions: ${context.prompt}`;
    }

    return prompt;
  }

  /**
   * Format content using template's formatter
   */
  private formatContent(
    template: ContentTemplate,
    generatedContent: unknown,
  ): string {
    return template.formatter
      ? template.formatter.format(generatedContent)
      : typeof generatedContent === "string"
        ? generatedContent
        : JSON.stringify(generatedContent);
  }
}
