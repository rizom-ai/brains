import type {
  Plugin,
  PluginContext,
  PluginCapabilities,
  PluginTool,
  PluginResource,
} from "./interfaces";
import type { Logger } from "@brains/utils";
import type { z } from "zod";
import { validatePluginConfig } from "./config";

/**
 * Base abstract class for plugins that provides common functionality
 */
export abstract class BasePlugin<TConfig = unknown> implements Plugin {
  public readonly id: string;
  public readonly version: string;
  public readonly description: string;
  public readonly packageName: string;
  protected config: TConfig;
  protected logger?: Logger;
  protected context?: PluginContext;

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    config: unknown,
    configSchema?: z.ZodType<TConfig>,
  ) {
    this.id = id;
    this.packageName = packageJson.name;
    this.version = packageJson.version;
    this.description = packageJson.description ?? `${packageJson.name} plugin`;

    // Validate config if schema provided
    if (configSchema) {
      this.config = validatePluginConfig(configSchema, config, this.id);
    } else {
      this.config = config as TConfig;
    }
  }

  /**
   * Register the plugin and return its capabilities
   */
  async register(context: PluginContext): Promise<PluginCapabilities> {
    this.context = context;
    this.logger = context.logger;

    // Call lifecycle hook
    await this.onRegister(context);

    return {
      tools: await this.getTools(),
      resources: await this.getResources(),
    };
  }

  /**
   * Lifecycle hook called during registration
   * Override this to perform initialization
   */
  protected async onRegister(_context: PluginContext): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Get the tools provided by this plugin
   * Override this to provide plugin-specific tools
   */
  protected async getTools(): Promise<PluginTool[]> {
    return [];
  }

  /**
   * Get the resources provided by this plugin
   * Override this to provide plugin-specific resources
   */
  protected async getResources(): Promise<PluginResource[]> {
    return [];
  }

  /**
   * Optional shutdown method for cleanup
   * Override this if your plugin needs cleanup
   */
  async shutdown?(): Promise<void> {
    await this.onShutdown();
  }

  /**
   * Lifecycle hook called during shutdown
   * Override this to perform cleanup
   */
  protected async onShutdown(): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Helper to log debug messages (only if debug is enabled in config)
   */
  protected debug(message: string, data?: unknown): void {
    if (this.logger && this.isDebugEnabled()) {
      this.logger.debug(`[${this.id}] ${message}`, data);
    }
  }

  /**
   * Helper to log info messages
   */
  protected info(message: string, data?: unknown): void {
    if (this.logger) {
      this.logger.info(`[${this.id}] ${message}`, data);
    }
  }

  /**
   * Helper to log warning messages
   */
  protected warn(message: string, data?: unknown): void {
    if (this.logger) {
      this.logger.warn(`[${this.id}] ${message}`, data);
    }
  }

  /**
   * Helper to log error messages
   */
  protected error(message: string, error?: unknown): void {
    if (this.logger) {
      this.logger.error(`[${this.id}] ${message}`, error);
    }
  }

  /**
   * Check if debug logging is enabled
   */
  private isDebugEnabled(): boolean {
    // Check if config has a debug property
    if (
      typeof this.config === "object" &&
      this.config !== null &&
      "debug" in this.config
    ) {
      const configObj = this.config as { debug?: unknown };
      return Boolean(configObj.debug);
    }
    return false;
  }

  /**
   * Helper to create a tool with consistent structure
   */
  protected createTool(
    name: string,
    description: string,
    inputSchema: z.ZodRawShape,
    handler: PluginTool["handler"],
    visibility: PluginTool["visibility"] = "anchor",
  ): PluginTool {
    return {
      name: `${this.id}:${name}`,
      description,
      inputSchema,
      handler: async (input, context): Promise<unknown> => {
        this.debug(`Executing tool ${name}`, { input });
        try {
          const result = await handler(input, context);
          this.debug(`Tool ${name} completed`, { result });
          return result;
        } catch (error) {
          this.error(`Tool ${name} failed`, error);
          throw error;
        }
      },
      visibility,
    };
  }

  /**
   * Helper to create a resource with consistent structure
   */
  protected createResource(
    uri: string,
    name: string,
    description: string,
    handler: PluginResource["handler"],
    mimeType = "text/plain",
  ): PluginResource {
    return {
      uri: `${this.id}:${uri}`,
      name,
      description,
      mimeType,
      handler: async (): Promise<{
        contents: Array<{
          text: string;
          uri: string;
          mimeType?: string;
        }>;
      }> => {
        this.debug(`Fetching resource ${uri}`);
        try {
          const result = await handler();
          this.debug(`Resource ${uri} fetched`);
          return result;
        } catch (error) {
          this.error(`Resource ${uri} failed`, error);
          throw error;
        }
      },
    };
  }

  /**
   * Get the plugin context
   */
  protected getContext(): PluginContext {
    if (!this.context) {
      throw new Error(`Plugin ${this.id} not registered yet`);
    }
    return this.context;
  }
}
