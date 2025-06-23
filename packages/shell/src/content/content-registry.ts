import type { z } from "zod";
import type { Logger } from "@brains/utils";
import type {
  ContentRegistry as IContentRegistry,
  ContentConfig,
  ContentTemplate,
  ContentFormatter,
} from "@brains/types";
import type { ContentGenerationService } from "./contentGenerationService";

/**
 * Unified content registry that combines templates and formatters
 *
 * This registry manages the relationship between content templates
 * (for AI generation) and schema formatters (for parsing/formatting).
 * It ensures that content types have both generation and formatting
 * capabilities properly configured.
 */
export class ContentRegistry implements IContentRegistry {
  private static instance: ContentRegistry | null = null;

  private configs = new Map<string, ContentConfig<unknown>>();
  private contentGenerationService: ContentGenerationService | null = null;
  private logger: Logger | null = null;

  // Singleton access
  public static getInstance(): ContentRegistry {
    ContentRegistry.instance ??= new ContentRegistry();
    return ContentRegistry.instance;
  }

  // Testing reset
  public static resetInstance(): void {
    ContentRegistry.instance = null;
  }

  // Isolated instance creation
  public static createFresh(): ContentRegistry {
    return new ContentRegistry();
  }

  // Private constructor to enforce factory methods
  private constructor() {
    // Dependencies will be injected via initialize method
  }

  /**
   * Initialize with dependencies
   */
  public initialize(
    contentGenerationService: ContentGenerationService,
    logger: Logger,
  ): void {
    this.contentGenerationService = contentGenerationService;
    this.logger = logger;
  }

  /**
   * Register a content configuration
   */
  public registerContent<T>(name: string, config: ContentConfig<T>): void {
    // Validate namespace format
    if (!name.includes(":")) {
      throw new Error(
        `Content name must be namespaced (e.g., "plugin:category:type"): ${name}`,
      );
    }

    // Ensure schema consistency
    if (config.template.schema !== config.schema) {
      this.logger?.warn(
        `Content config for ${name} has different schemas in template and config. Using config.schema.`,
      );
    }

    this.configs.set(name, config as ContentConfig<unknown>);

    // Also register the template with ContentGenerationService
    if (this.contentGenerationService) {
      this.contentGenerationService.registerTemplate(name, config.template);
    }

    this.logger?.debug(`Registered content: ${name}`);
  }

  /**
   * Get content template
   */
  public getTemplate<T = unknown>(name: string): ContentTemplate<T> | null {
    const config = this.configs.get(name);
    return config ? (config.template as ContentTemplate<T>) : null;
  }

  /**
   * Get content formatter
   */
  public getFormatter<T = unknown>(name: string): ContentFormatter<T> | null {
    const config = this.configs.get(name);
    return config ? (config.formatter as ContentFormatter<T>) : null;
  }

  /**
   * Get content schema
   */
  public getSchema<T = unknown>(name: string): z.ZodType<T> | null {
    const config = this.configs.get(name);
    return config ? (config.schema as z.ZodType<T>) : null;
  }

  /**
   * Generate content using registered template
   */
  public async generateContent<T>(
    templateName: string,
    context: unknown,
  ): Promise<T> {
    if (!this.contentGenerationService) {
      throw new Error("ContentGenerationService not initialized");
    }

    const config = this.configs.get(templateName);
    if (!config) {
      throw new Error(`No content registered for: ${templateName}`);
    }

    // Use the content generation service
    return this.contentGenerationService.generate({
      schema: config.schema as z.ZodType<T>,
      prompt: config.template.basePrompt,
      contentType: templateName,
      context: context as Record<string, unknown>,
    });
  }

  /**
   * Parse content using registered formatter
   */
  public parseContent<T>(templateName: string, content: string): T {
    const config = this.configs.get(templateName);
    if (!config) {
      throw new Error(`No content registered for: ${templateName}`);
    }

    // Parse the content using the formatter
    const parsed = config.formatter.parse(content);

    // Validate with schema
    return config.schema.parse(parsed) as T;
  }

  /**
   * Format content using registered formatter
   */
  public formatContent(templateName: string, data: unknown): string {
    const config = this.configs.get(templateName);
    if (!config) {
      throw new Error(`No content registered for: ${templateName}`);
    }

    // Validate data before formatting
    const validated = config.schema.parse(data);

    return config.formatter.format(validated);
  }

  /**
   * List all registered content names
   */
  public listContent(namespace?: string): string[] {
    const names = Array.from(this.configs.keys());
    if (namespace) {
      return names.filter((n) => n.startsWith(`${namespace}:`));
    }
    return names;
  }

  /**
   * Check if content is registered
   */
  public hasContent(name: string): boolean {
    return this.configs.has(name);
  }

  /**
   * Clear all registrations
   */
  public clear(): void {
    this.configs.clear();
    this.logger?.debug("Cleared all content registrations");
  }
}
