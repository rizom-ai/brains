import type { Template, GenerationContext } from "./types";
import type { EntityService, SearchResult } from "@brains/entity-service";
import type { AIService } from "@brains/ai-service";
import type { Logger } from "@brains/utils";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { ContentGenerator as IContentGenerator } from "./types";

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
 * Content Generator
 *
 * Provides centralized content generation functionality with template-based approach.
 * Implements Component Interface Standardization pattern.
 */
export class ContentGenerator implements IContentGenerator {
  // Template registry for local template management
  private templates: Map<string, Template<unknown>> = new Map();

  /**
   * Create a new instance of ContentGenerator
   */
  constructor(private readonly dependencies: ContentGeneratorDependencies) {}

  /**
   * Apply template scoping logic
   */
  private applyTemplateScoping(
    templateName: string,
    pluginId?: string,
  ): string {
    // If no pluginId provided, use template name as-is
    if (!pluginId) {
      return templateName;
    }

    // If template name already has scoping (contains ":"), use as-is
    if (templateName.includes(":")) {
      return templateName;
    }

    // Apply plugin scoping
    return `${pluginId}:${templateName}`;
  }

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
    pluginId?: string,
  ): Promise<T> {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as Template<T>;

    // Check if template supports AI generation
    if (!typedTemplate.basePrompt) {
      // Template doesn't use AI - check for getData method
      if (typedTemplate.getData) {
        return typedTemplate.getData({
          context,
          dependencies: this.dependencies,
        });
      }
      throw new Error(
        `Template ${templateName} must have either basePrompt or getData method`,
      );
    }

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
  parseContent<T = unknown>(
    templateName: string,
    content: string,
    pluginId?: string,
  ): T {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    // Cast template to correct type
    const typedTemplate = template as Template<T>;

    if (!typedTemplate.formatter) {
      throw new Error(
        `Template ${scopedTemplateName} does not have a formatter for parsing`,
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
        routeId: route.id,
        routeTitle: route.title,
        routeDescription: route.description,
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
  formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number; pluginId?: string },
  ): string {
    // Apply template scoping if pluginId is provided
    const scopedTemplateName = this.applyTemplateScoping(
      templateName,
      options?.pluginId,
    );

    const template = this.getTemplate(scopedTemplateName);
    if (!template) {
      throw new Error(`Template not found: ${scopedTemplateName}`);
    }

    if (!template.formatter) {
      throw new Error(
        `Template ${scopedTemplateName} does not have a formatter`,
      );
    }

    // Use the formatter to convert object to string
    let formatted = template.formatter.format(data);

    // Apply truncation if requested
    if (options?.truncate && formatted.length > options.truncate) {
      formatted = formatted.substring(0, options.truncate) + "...";
    }

    return formatted;
  }

  /**
   * Build enhanced prompt with context from template, user context, and entities
   */
  private buildPrompt<T>(
    template: Template<T>,
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): string {
    // basePrompt is required for AI generation, verified by caller
    if (!template.basePrompt) {
      throw new Error("Template basePrompt is required for AI generation");
    }
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
