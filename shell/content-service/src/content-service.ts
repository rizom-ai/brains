import type { GenerationContext } from "./types";
import type { Template } from "@brains/view-registry";
import type { EntityService, SearchResult } from "@brains/entity-service";
import type { IAIService } from "@brains/ai-service";
import type { Logger } from "@brains/utils";
import type { RouteDefinition, SectionDefinition } from "@brains/view-registry";
import type { ContentService as IContentService } from "./types";
import type {
  IConversationService,
  Message,
} from "@brains/conversation-service";
import type { IContentProvider, ProviderInfo } from "./providers/types";

/**
 * Progress information for content generation operations
 */
export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
}

/**
 * Dependencies required by ContentService
 */
export interface ContentServiceDependencies {
  logger: Logger;
  entityService: EntityService;
  aiService: IAIService;
  conversationService: IConversationService;
}

/**
 * Content Service
 *
 * Provides content coordination, provider management, and common utilities.
 * Implements Component Interface Standardization pattern.
 */
export class ContentService implements IContentService {
  // Template registry for local template management
  private templates: Map<string, Template<unknown>> = new Map();

  // Provider registry for content providers
  private providers: Map<string, IContentProvider> = new Map();

  /**
   * Create a new instance of ContentService
   */
  constructor(private readonly dependencies: ContentServiceDependencies) {}

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
   * TODO: Factor out conversationId from content generation - it should be handled
   * at a higher level (e.g., in conversation-aware interfaces) rather than being
   * part of the core content generation logic
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

    // Build enhanced prompt with template, user context, entity context, and conversation context
    const enhancedPrompt = await this.buildPrompt(
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
      conversationId: "system",
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
   * Format messages as conversation context for AI prompts
   */
  private formatMessagesAsContext(messages: Message[]): string {
    if (messages.length === 0) {
      return "";
    }

    // Format messages as a conversation transcript
    return messages
      .map((m) => {
        const role = m.role.charAt(0).toUpperCase() + m.role.slice(1);
        return `${role}: ${m.content}`;
      })
      .join("\n\n");
  }

  /**
   * Build enhanced prompt with context from template, user context, entities, and conversation
   */
  private async buildPrompt<T>(
    template: Template<T>,
    context: GenerationContext,
    relevantEntities: SearchResult[] = [],
  ): Promise<string> {
    // basePrompt is required for AI generation, verified by caller
    if (!template.basePrompt) {
      throw new Error("Template basePrompt is required for AI generation");
    }
    let prompt = template.basePrompt;

    // Add conversation context if not a system conversation
    if (
      context.conversationId &&
      context.conversationId !== "system" &&
      context.conversationId !== "default"
    ) {
      try {
        const messages =
          await this.dependencies.conversationService.getMessages(
            context.conversationId,
            { limit: 20 }, // Get last 20 messages for context
          );

        const workingMemory = this.formatMessagesAsContext(messages);
        if (workingMemory) {
          prompt += `\n\nRecent conversation context:\n${workingMemory}`;
        }
      } catch (error) {
        // Log error but don't fail generation if conversation context unavailable
        this.dependencies.logger.debug("Failed to get conversation context", {
          error,
          conversationId: context.conversationId,
        });
      }
    }

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

  // ========== Provider Management ==========

  /**
   * Register a content provider
   */
  registerProvider(provider: IContentProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(
        `Provider with id "${provider.id}" is already registered`,
      );
    }
    this.providers.set(provider.id, provider);
    this.dependencies.logger.debug(
      `Registered content provider: ${provider.id}`,
    );
  }

  /**
   * Get a provider by ID
   */
  getProvider(id: string): IContentProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * List all registered providers
   */
  listProviders(): IContentProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get provider information for discovery
   */
  getProviderInfo(id: string): ProviderInfo | undefined {
    const provider = this.providers.get(id);
    if (!provider) {
      return undefined;
    }

    return {
      id: provider.id,
      name: provider.name,
      capabilities: {
        canGenerate: typeof provider.generate === "function",
        canFetch: typeof provider.fetch === "function",
        canTransform: typeof provider.transform === "function",
      },
    };
  }

  /**
   * Get all provider information
   */
  getAllProviderInfo(): ProviderInfo[] {
    return this.listProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      capabilities: {
        canGenerate: typeof provider.generate === "function",
        canFetch: typeof provider.fetch === "function",
        canTransform: typeof provider.transform === "function",
      },
    }));
  }

  /**
   * Generate content using a provider
   */
  async generateFromProvider(
    providerId: string,
    request: unknown,
  ): Promise<unknown> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    if (!provider.generate) {
      throw new Error(`Provider "${providerId}" does not support generation`);
    }

    this.dependencies.logger.debug(
      `Generating content with provider: ${providerId}`,
    );
    return provider.generate(request);
  }

  /**
   * Fetch data using a provider
   */
  async fetchFromProvider(
    providerId: string,
    query?: unknown,
  ): Promise<unknown> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    if (!provider.fetch) {
      throw new Error(`Provider "${providerId}" does not support fetching`);
    }

    this.dependencies.logger.debug(
      `Fetching data with provider: ${providerId}`,
    );
    return provider.fetch(query);
  }

  /**
   * Transform content using a provider
   */
  async transformWithProvider(
    providerId: string,
    content: unknown,
    format: string,
  ): Promise<unknown> {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Provider "${providerId}" not found`);
    }

    if (!provider.transform) {
      throw new Error(
        `Provider "${providerId}" does not support transformation`,
      );
    }

    this.dependencies.logger.debug(
      `Transforming content with provider: ${providerId} to format: ${format}`,
    );
    return provider.transform(content, format);
  }
}
