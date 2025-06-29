import type { Template, Logger, SearchResult } from "@brains/types";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { IEntityService as EntityService } from "@brains/entity-service";
import type { IAIService as AIService } from "@brains/ai-service";

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
  logger: Logger;
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

  // Template registry for local template management
  private templates: Map<string, Template<unknown>> = new Map();

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
  registerTemplate<T>(name: string, template: Template<T>): void {
    // When storing in a heterogeneous map, we lose specific type information
    // This is safe because templates are retrieved by name and used with appropriate types
    this.templates.set(name, template as Template<unknown>);
  }

  /**
   * Get a registered template
   */
  getTemplate(name: string): Template<unknown> | null {
    return this.templates.get(name) ?? null;
  }

  /**
   * List all available templates
   */
  listTemplates(): Template<unknown>[] {
    return Array.from(this.templates.values());
  }

  /**
   * Generate content using a template with entity-aware context
   */
  async generateContent<T = unknown>(
    templateName: string,
    context: GenerationContext = {},
  ): Promise<T> {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as Template<T>;

    // Query relevant entities to provide context for generation
    const searchTerms = [typedTemplate.basePrompt, context.prompt]
      .filter(Boolean)
      .join(" ");
    const relevantEntities = searchTerms
      ? await this.dependencies.entityService.search(searchTerms, { limit: 5 })
      : [];

    // Build enhanced prompt with template, user context, and entity context
    const enhancedPrompt = this.buildPrompt(
      typedTemplate,
      context,
      relevantEntities,
    );

    // Generate content using AI service with entity-informed context
    const result = await this.dependencies.aiService.generateObject<T>(
      typedTemplate.basePrompt,
      enhancedPrompt,
      typedTemplate.schema,
    );

    // Return the typed content directly - no cast needed
    return result.object;
  }

  /**
   * Parse existing content using a template's formatter
   */
  parseContent<T = unknown>(templateName: string, content: string): T {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as Template<T>;

    if (!typedTemplate.formatter) {
      throw new Error(
        `Template ${templateName} does not have a formatter for parsing`,
      );
    }

    // Use the formatter to parse the content
    return typedTemplate.formatter.parse(content);
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

    const templateName = section.template;

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

    // Generate content as object first
    const contentObject = await this.generateContent(templateName, context);

    // Use the formatContent method to convert object to string
    return this.formatContent(templateName, contentObject);
  }

  /**
   * Format content using a template's formatter
   */
  formatContent<T = unknown>(templateName: string, data: T): string {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    if (!template.formatter) {
      throw new Error(`Template ${templateName} does not have a formatter`);
    }

    // Use the formatter to convert object to string
    return template.formatter.format(data);
  }

  /**
   * Build enhanced prompt with context from template, user context, and entities
   */
  private buildPrompt<T>(
    template: Template<T>,
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): string {
    let prompt = template.basePrompt;

    // Add entity context to inform the generation
    if (relevantEntities.length > 0) {
      const entityContext = relevantEntities
        .map(
          (result) =>
            `[${result.entity.entityType}] ${result.entity.id}: ${result.excerpt}`,
        )
        .join("\n");
      prompt += `\n\nRelevant context from your knowledge base:\n${entityContext}`;
    }

    // Add user context data if provided
    if (context.data) {
      prompt += `\n\nContext data:\n${JSON.stringify(context.data, null, 2)}`;
    }

    // Add additional instructions if provided
    if (context.prompt) {
      prompt += `\n\nAdditional instructions: ${context.prompt}`;
    }

    return prompt;
  }
}
