import type {
  PluginContext,
  PluginTool,
  ContentTypeRegistry,
  ContentFormatter,
} from "@brains/types";
import type { z } from "zod";
import { BasePlugin } from "./base-plugin";

/**
 * Configuration for content generation
 */
export interface ContentGenerationConfig<T = unknown> {
  schema: z.ZodType<T>;
  contentType: string;
  formatter?: ContentFormatter<T>;
  saveByDefault?: boolean;
}

/**
 * Base class for plugins that generate content
 */
export abstract class ContentGeneratingPlugin<
  TConfig = unknown,
> extends BasePlugin<TConfig> {
  protected contentTypes: Map<string, ContentGenerationConfig<unknown>> = new Map();
  protected contentTypeRegistry?: ContentTypeRegistry;

  /**
   * Register content types during plugin initialization
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);
    this.contentTypeRegistry = context.contentTypeRegistry;

    // Register all content types
    for (const [key, config] of this.contentTypes) {
      this.debug(`Registering content type: ${config.contentType}`, { key });
      this.contentTypeRegistry.register(
        config.contentType,
        config.schema,
        config.formatter,
      );
      this.info(`Registered content type: ${config.contentType}`);
    }
  }

  /**
   * Register a content type that this plugin can generate
   */
  protected registerContentType<T>(
    key: string,
    config: ContentGenerationConfig<T>,
  ): void {
    // Ensure contentType includes plugin namespace
    if (!config.contentType.startsWith(`${this.id}:`)) {
      config.contentType = `${this.id}:${config.contentType}`;
    }

    this.contentTypes.set(key, config);
  }

  /**
   * Create a content generation tool
   */
  protected createContentGenerationTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape & {
      save?: z.ZodOptional<z.ZodBoolean>;
    },
    generateContent: (input: unknown) => Promise<unknown>,
    contentTypeKey: string,
  ): PluginTool {
    return this.createTool(
      name,
      description,
      inputSchema,
      async (input, context) => {
        const config = this.contentTypes.get(contentTypeKey);
        if (!config) {
          throw new Error(`Unknown content type key: ${contentTypeKey}`);
        }

        // Report progress if available
        if (context?.sendProgress) {
          await context.sendProgress({
            progress: 0,
            total: 100,
            message: "Generating content...",
          });
        }

        // Generate the content
        const content = await generateContent(input);

        // Validate against schema
        const validatedContent = config.schema.parse(content);

        // Determine if we should save
        const inputWithSave = input as { save?: boolean };
        const shouldSave = inputWithSave.save ?? config.saveByDefault ?? false;

        if (shouldSave === true) {
          // Save the content as an entity
          const entityService = this.getContext().entityService;
          const entity = await entityService.createEntity({
            entityType: "generated-content",
            content: JSON.stringify(validatedContent),
          });

          return {
            content: validatedContent,
            saved: true,
            entityId: entity.id,
            message: `Content saved with ID: ${entity.id}`,
          };
        }

        return {
          content: validatedContent,
          saved: false,
        };
      },
    );
  }

  /**
   * Create a batch content generation tool
   */
  protected createBatchGenerationTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape & {
      save?: z.ZodOptional<z.ZodBoolean>;
      count?: z.ZodOptional<z.ZodNumber>;
    },
    generateBatch: (input: unknown) => Promise<unknown[]>,
    contentTypeKey: string,
  ): PluginTool {
    return this.createTool(
      name,
      description,
      inputSchema,
      async (input, context) => {
        const config = this.contentTypes.get(contentTypeKey);
        if (!config) {
          throw new Error(`Unknown content type key: ${contentTypeKey}`);
        }

        // Report progress if available
        if (context?.sendProgress) {
          await context.sendProgress({
            progress: 0,
            total: 100,
            message: "Generating batch content...",
          });
        }

        // Generate the batch
        const items = await generateBatch(input);
        const validatedItems = items.map((item) => config.schema.parse(item));

        // Determine if we should save
        const inputWithSave = input as { save?: boolean };
        const shouldSave = inputWithSave.save ?? config.saveByDefault ?? false;

        if (shouldSave === true) {
          const entityService = this.getContext().entityService;
          const savedItems = await Promise.all(
            validatedItems.map(async (item) => {
              const entity = await entityService.createEntity({
                entityType: "generated-content",
                content: JSON.stringify(item),
              });
              return {
                content: item,
                entityId: entity.id,
              };
            }),
          );

          return {
            items: savedItems,
            count: savedItems.length,
            saved: true,
            message: `Saved ${savedItems.length} items`,
          };
        }

        return {
          items: validatedItems.map((content) => ({ content })),
          count: validatedItems.length,
          saved: false,
        };
      },
    );
  }

  /**
   * Helper to create a formatter for structured content
   */
  protected createStructuredFormatter<T>(
    format: (data: T) => string,
    parse: (content: string) => T,
  ): ContentFormatter<T> {
    return {
      format: (data: unknown): string => {
        return format(data as T);
      },
      parse: (content: string): T => {
        return parse(content);
      },
    };
  }
}
