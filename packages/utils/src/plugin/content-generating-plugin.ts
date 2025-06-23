import type {
  PluginContext,
  PluginTool,
  ContentRegistry,
  ContentConfig,
  ContentTemplate,
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
  template: ContentTemplate<T>;
  formatter: ContentFormatter<T>;
}

/**
 * Base class for plugins that generate content
 */
export abstract class ContentGeneratingPlugin<
  TConfig = unknown,
> extends BasePlugin<TConfig> {
  protected contentTypes = new Map<string, ContentGenerationConfig<unknown>>();
  protected contentRegistry?: ContentRegistry;

  /**
   * Register content types during plugin initialization
   */
  protected override async onRegister(context: PluginContext): Promise<void> {
    await super.onRegister(context);
    this.contentRegistry = context.contentRegistry;

    // Register all content types with the new ContentRegistry
    for (const [key, config] of this.contentTypes) {
      this.debug(`Registering content type: ${config.contentType}`, { key });
      
      const contentConfig: ContentConfig = {
        template: config.template,
        formatter: config.formatter,
        schema: config.schema,
      };
      
      this.contentRegistry.registerContent(
        config.contentType,
        contentConfig,
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

    this.contentTypes.set(key, config as ContentGenerationConfig<unknown>);
  }

  /**
   * Create a content generation tool
   */
  protected createContentGenerationTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape,
    generateContent: (input: unknown) => Promise<unknown>,
    contentTypeKey: string,
    visibility: PluginTool["visibility"] = "anchor",
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

        return {
          content: validatedContent,
        };
      },
      visibility,
    );
  }

  /**
   * Create a batch content generation tool
   */
  protected createBatchGenerationTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape & {
      count?: z.ZodOptional<z.ZodNumber>;
    },
    generateBatch: (input: unknown) => Promise<unknown[]>,
    contentTypeKey: string,
    visibility: PluginTool["visibility"] = "anchor",
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

        return {
          items: validatedItems.map((content) => ({ content })),
          count: validatedItems.length,
        };
      },
      visibility,
    );
  }

  /**
   * Helper to create a content formatter for structured content
   */
  protected createStructuredFormatter<T>(
    format: (data: T) => string,
    parse: (content: string) => T,
  ): ContentFormatter<T> {
    return {
      format: (data: T): string => {
        return format(data);
      },
      parse: (content: string): T => {
        return parse(content);
      },
    };
  }
}
