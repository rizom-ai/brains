import type { QueryProcessor } from "../query/queryProcessor";
import type {
  ContentGenerateOptions,
  ContentTemplate,
  BatchGenerateOptions,
} from "@brains/types";

import type { EntityService } from "../entity/entityService";
import type { GeneratedContent } from "@brains/types";
import type { ContentTypeRegistry } from "./contentTypeRegistry";

export class ContentGenerationService {
  private static instance: ContentGenerationService | null = null;
  private templates: Map<string, ContentTemplate<unknown>> = new Map();
  private queryProcessor: QueryProcessor | null = null;
  private entityService: EntityService | null = null;
  private contentTypeRegistry: ContentTypeRegistry | null = null;

  // Singleton access
  public static getInstance(): ContentGenerationService {
    ContentGenerationService.instance ??= new ContentGenerationService();
    return ContentGenerationService.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    ContentGenerationService.instance = null;
  }

  // Isolated instance creation
  public static createFresh(): ContentGenerationService {
    return new ContentGenerationService();
  }

  // Private constructor to enforce factory methods
  private constructor() {
    // QueryProcessor will be injected via initialize method
  }

  /**
   * Initialize with dependencies
   */
  public initialize(
    queryProcessor: QueryProcessor,
    entityService: EntityService,
    contentTypeRegistry: ContentTypeRegistry,
  ): void {
    this.queryProcessor = queryProcessor;
    this.entityService = entityService;
    this.contentTypeRegistry = contentTypeRegistry;
  }

  /**
   * Generate content matching a schema
   */
  public async generate<T>(options: ContentGenerateOptions<T>): Promise<T> {
    if (!this.queryProcessor) {
      throw new Error(
        "ContentGenerationService not initialized with QueryProcessor",
      );
    }

    const enhancedPrompt = this.buildPrompt(options);

    // Use query processor with schema
    const result = await this.queryProcessor.processQuery(enhancedPrompt, {
      schema: options.schema,
    });

    // Check that content type is registered
    if (!this.contentTypeRegistry) {
      throw new Error(
        "ContentGenerationService not initialized with ContentTypeRegistry",
      );
    }
    if (!this.contentTypeRegistry.has(options.contentType)) {
      throw new Error(
        `No schema registered for content type: ${options.contentType}`,
      );
    }

    // Validate using the provided schema
    const validatedResult = options.schema.parse(result);

    // Save as generated-content entity if requested
    if (options.save) {
      if (!this.entityService) {
        throw new Error(
          "ContentGenerationService not initialized with EntityService - cannot save content",
        );
      }

      await this.saveGeneratedContent(
        validatedResult,
        options.prompt,
        options.contentType,
        options.context,
      );
    }

    return validatedResult;
  }

  /**
   * Generate multiple content pieces
   */
  public async generateBatch<T>(
    options: BatchGenerateOptions<T>,
  ): Promise<T[]> {
    const results: T[] = [];

    for (const item of options.items) {
      const generateOptions: ContentGenerateOptions<T> = {
        schema: options.schema,
        prompt: item.prompt,
        contentType: options.contentType,
      };

      if (item.context) {
        generateOptions.context = { data: item.context };
      }

      const result = await this.generate(generateOptions);
      results.push(result);
    }

    return results;
  }

  /**
   * Register reusable templates
   */
  public registerTemplate<T>(name: string, template: ContentTemplate<T>): void {
    this.templates.set(name, template);
  }

  /**
   * Get registered template
   */
  public getTemplate(name: string): ContentTemplate<unknown> | null {
    return this.templates.get(name) ?? null;
  }

  /**
   * List all templates
   */
  public listTemplates(): ContentTemplate<unknown>[] {
    return Array.from(this.templates.values());
  }

  /**
   * Build enhanced prompt with context and template
   */
  private buildPrompt<T>(options: ContentGenerateOptions<T>): string {
    let prompt = options.prompt;

    // Add style guidance if provided
    if (options.context?.style) {
      prompt = `${prompt}\n\nStyle guidelines: ${options.context.style}`;
    }

    // Add examples if provided
    if (options.context?.examples && options.context.examples.length > 0) {
      const examplesJson = JSON.stringify(options.context.examples, null, 2);
      prompt = `${prompt}\n\nHere are some examples of the expected output format:\n${examplesJson}`;
    }

    // Add additional data context if provided
    if (options.context?.data && Object.keys(options.context.data).length > 0) {
      const dataJson = JSON.stringify(options.context.data, null, 2);
      prompt = `${prompt}\n\nAdditional context data:\n${dataJson}`;
    }

    // Note: Entity context is handled by QueryProcessor automatically

    return prompt;
  }

  /**
   * Generate content using a registered template
   */
  public async generateFromTemplate(
    templateName: string,
    options: Omit<ContentGenerateOptions<unknown>, "schema">,
  ): Promise<unknown> {
    const template = this.getTemplate(templateName);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    // Simply combine template prompt with user prompt
    const mergedPrompt = `${template.basePrompt}\n\n${options.prompt}`;

    const generateOptions: ContentGenerateOptions<unknown> = {
      schema: template.schema,
      prompt: mergedPrompt,
      contentType: options.contentType,
    };

    if (options.context) {
      generateOptions.context = options.context;
    }

    return this.generate(generateOptions);
  }

  /**
   * Retrieve and validate generated content
   */
  public async getGeneratedContent(
    contentType: string,
    id?: string,
  ): Promise<unknown | null> {
    if (!this.entityService) {
      throw new Error("EntityService not available for retrieving content");
    }

    // If ID is provided, get specific entity
    if (id) {
      const entity = await this.entityService.getEntity<GeneratedContent>(
        "generated-content",
        id,
      );
      if (!entity) {
        return null;
      }

      return entity.data;
    }

    // Otherwise, list entities filtered by contentType
    const entities = await this.entityService.listEntities<GeneratedContent>(
      "generated-content",
      {
        filter: {
          metadata: { contentType },
        },
        limit: 1,
        sortBy: "updated",
        sortDirection: "desc",
      },
    );

    if (entities.length === 0) {
      return null;
    }

    const entity = entities[0];
    if (!entity) {
      return null;
    }

    return entity.data;
  }

  /**
   * Save generated content as an entity
   */
  private async saveGeneratedContent(
    content: unknown,
    prompt: string,
    contentType: string,
    context?: unknown,
  ): Promise<void> {
    if (!this.entityService) {
      throw new Error("EntityService not available for saving content");
    }

    await this.entityService.createEntity<GeneratedContent>({
      entityType: "generated-content",
      contentType: contentType,
      data: content as Record<string, unknown>,
      content: JSON.stringify(content, null, 2),
      metadata: {
        prompt,
        context,
        generatedAt: new Date().toISOString(),
        generatedBy: "claude-3-sonnet",
        regenerated: false,
        validationStatus: "valid",
      },
    });
  }
}
