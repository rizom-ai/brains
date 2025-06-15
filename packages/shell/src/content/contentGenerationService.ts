import type { QueryProcessor } from "../query/queryProcessor";
import type {
  ContentGenerateOptions,
  ContentTemplate,
  BatchGenerateOptions,
  ContentGenerationService as IContentGenerationService,
} from "@brains/types";

import type { ContentTypeRegistry } from "./contentTypeRegistry";
import type { Logger } from "@brains/utils";
import { generateWithTemplate } from "@brains/utils";

export class ContentGenerationService implements IContentGenerationService {
  private static instance: ContentGenerationService | null = null;
  private templates: Map<string, ContentTemplate<unknown>> = new Map();
  private queryProcessor: QueryProcessor | null = null;
  private contentTypeRegistry: ContentTypeRegistry | null = null;
  private logger: Logger | null = null;

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
    contentTypeRegistry: ContentTypeRegistry,
    logger: Logger,
  ): void {
    this.queryProcessor = queryProcessor;
    this.contentTypeRegistry = contentTypeRegistry;
    this.logger = logger;
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

    // Debug: Log the raw AI response
    this.logger?.debug("Raw AI response for content generation", {
      contentType: options.contentType,
      result: JSON.stringify(result, null, 2),
      resultType: typeof result,
    });

    // Check that content type is registered
    if (!this.contentTypeRegistry) {
      throw new Error(
        "ContentGenerationService not initialized with ContentTypeRegistry",
      );
    }

    // Debug logging
    this.logger?.debug("Checking for content type", {
      contentType: options.contentType,
      registeredTypes: this.contentTypeRegistry.list(),
    });

    // Check if this is a collection item (has 3 parts: plugin:collection:item)
    const parts = options.contentType.split(":");
    const isCollectionItem = parts.length === 3;

    if (
      !isCollectionItem &&
      !this.contentTypeRegistry.has(options.contentType)
    ) {
      throw new Error(
        `No schema registered for content type: ${options.contentType}`,
      );
    }

    // Validate using the provided schema
    const validatedResult = options.schema.parse(result);

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
   * Generate content for a specific content type, handling collections automatically
   */
  public async generateContent(
    contentType: string,
    options: {
      prompt?: string;
      context?: Record<string, unknown>;
    } = {},
  ): Promise<unknown> {
    // Get the template - templates are required
    const template = this.getTemplate(contentType);
    if (!template) {
      throw new Error(
        `No template registered for content type: ${contentType}`,
      );
    }

    if (template.items) {
      // This is a collection - generate each item
      return this.generateCollection(contentType, template, options);
    } else {
      // Simple content generation using template
      const additionalContext: {
        prompt?: string;
        data?: Record<string, unknown>;
      } = {};

      if (options.prompt !== undefined) {
        additionalContext.prompt = options.prompt;
      }
      if (options.context !== undefined) {
        additionalContext.data = options.context;
      }

      return generateWithTemplate(
        this.generate.bind(this),
        template,
        contentType,
        additionalContext,
      );
    }
  }

  /**
   * Generate a collection of content items
   */
  private async generateCollection(
    collectionType: string,
    template: ContentTemplate<unknown>,
    options: {
      prompt?: string;
      context?: Record<string, unknown>;
    },
  ): Promise<unknown> {
    if (!template.items) {
      throw new Error(`Template ${collectionType} is not a collection`);
    }

    const collectionData: Record<string, unknown> = {};

    // Generate each item in the collection
    for (const [itemKey, itemTemplate] of Object.entries(template.items)) {
      this.logger?.debug(
        `Generating item ${itemKey} for collection ${collectionType}`,
      );

      // Use generateWithTemplate for each item
      const additionalContext: {
        prompt?: string;
        data?: Record<string, unknown>;
      } = {};

      if (options.prompt !== undefined) {
        additionalContext.prompt = options.prompt;
      }
      if (options.context !== undefined) {
        additionalContext.data = options.context;
      }

      // For collection items, just use the existing generate method
      // with the item's schema directly
      const itemData = await generateWithTemplate(
        this.generate.bind(this),
        itemTemplate,
        `${collectionType}:${itemKey}`,
        additionalContext,
      );

      collectionData[itemKey] = itemData;
    }

    // Special handling for 'metadata' items - merge them into root level
    if (
      "metadata" in collectionData &&
      typeof collectionData["metadata"] === "object" &&
      collectionData["metadata"] !== null
    ) {
      const metadata = collectionData["metadata"] as Record<string, unknown>;
      // Merge metadata fields into root
      for (const [key, value] of Object.entries(metadata)) {
        collectionData[key] = value;
      }
      // Remove the metadata object itself since its fields are now at root
      delete collectionData["metadata"];
    }

    // Always validate the complete collection against the collection schema
    return template.schema.parse(collectionData);
  }
}
