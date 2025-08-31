import type {
  Plugin,
  PluginType,
  PluginCapabilities,
  PluginTool,
  PluginResource,
  ToolContext,
  ToolResponse,
} from "./interfaces";
import type { Command } from "@brains/command-registry";
import type { MessageHandler, MessageSender } from "@brains/messaging-service";
import type { IShell } from "@brains/plugins";
import { ToolContextRoutingSchema } from "./interfaces";
import {
  Logger,
  type ProgressNotification,
  ProgressReporter,
} from "@brains/utils";
import type { UserPermissionLevel } from "@brains/permission-service";
import { z } from "@brains/utils";

// Message schemas for validation
const toolExecuteRequestSchema = z.object({
  toolName: z.string(),
  args: z.unknown(),
  progressToken: z.union([z.string(), z.number()]).optional(),
  hasProgress: z.boolean().optional(),
  // Reuse the shared routing metadata schema
  ...ToolContextRoutingSchema.shape,
});

const resourceGetRequestSchema = z.object({
  resourceUri: z.string(),
});

// Core context interface - minimal requirements for all plugins
export interface CoreContext {
  pluginId: string;
  logger: Logger;
  sendMessage: MessageSender;
  subscribe: <T = unknown, R = unknown>(
    channel: string,
    handler: MessageHandler<T, R>,
  ) => () => void;
  formatContent: <T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ) => string;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
}

/**
 * Base abstract class for plugins that provides common functionality
 */
export abstract class BasePlugin<
  TConfig = unknown,
  TContext extends CoreContext = CoreContext,
> implements Plugin
{
  public readonly id: string;
  public readonly version: string;
  public readonly description: string;
  public readonly packageName: string;
  public abstract readonly type: PluginType;
  protected config: TConfig;
  protected context?: TContext;

  /**
   * Get the logger - uses context logger if available, creates temp logger otherwise
   */
  protected get logger(): Logger {
    return this.context?.logger ?? Logger.createFresh({ context: this.id });
  }

  constructor(
    id: string,
    packageJson: { name: string; version: string; description?: string },
    partialConfig: Partial<TConfig>,
    configSchema: z.ZodType<TConfig>,
    defaults: Partial<TConfig>,
  ) {
    this.id = id;
    this.packageName = packageJson.name;
    this.version = packageJson.version;
    this.description = packageJson.description ?? `${packageJson.name} plugin`;

    // Merge with defaults first, then validate
    const configWithDefaults = { ...defaults, ...partialConfig };
    this.config = configSchema.parse(configWithDefaults);
  }

  /**
   * Register the plugin - must be overridden by typed base classes
   * to create appropriate context from shell
   */
  abstract register(shell: IShell): Promise<PluginCapabilities>;

  /**
   * Set up message handlers for tool and resource execution
   */
  protected setupMessageHandlers(context: TContext): void {
    // Subscribe to tool execution requests for this specific plugin
    context.subscribe(`plugin:${this.id}:tool:execute`, async (message) => {
      try {
        // Validate and parse the message payload
        const {
          toolName,
          args,
          progressToken,
          hasProgress,
          interfaceType,
          userId,
          channelId,
        } = toolExecuteRequestSchema.parse(message.payload);

        const tools = await this.getTools();
        const tool = tools.find((t) => t.name === toolName);

        if (!tool) {
          return {
            success: false,
            error: `Tool not found: ${toolName}`,
          };
        }

        // Create context with routing metadata and optional progress callback
        const toolContext: ToolContext = {
          interfaceType,
          userId,
          ...(channelId && { channelId }),
          ...(hasProgress &&
            progressToken !== undefined && {
              progressToken,
              sendProgress: async (
                notification: ProgressNotification,
              ): Promise<void> => {
                // Send progress notification back through message bus
                await context.sendMessage(`plugin:${this.id}:progress`, {
                  progressToken,
                  notification,
                });
              },
            }),
        };

        // Execute the tool with optional context
        const result = await tool.handler(args, toolContext);
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: "Invalid tool execution request format",
          };
        }
        this.logger.error("Tool execution error", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // Subscribe to resource get requests for this specific plugin
    context.subscribe(`plugin:${this.id}:resource:get`, async (message) => {
      try {
        // Validate and parse the message payload
        const { resourceUri } = resourceGetRequestSchema.parse(message.payload);

        const resources = await this.getResources();
        const resource = resources.find((r) => r.uri === resourceUri);

        if (!resource) {
          return {
            success: false,
            error: `Resource not found: ${resourceUri}`,
          };
        }

        // Get the resource
        const result = await resource.handler();
        return {
          success: true,
          data: result,
        };
      } catch (error) {
        if (error instanceof z.ZodError) {
          return {
            success: false,
            error: "Invalid resource get request format",
          };
        }
        this.logger.error("Resource fetch error", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  /**
   * Lifecycle hook called during registration
   * Override this to perform initialization
   */
  protected async onRegister(_context: TContext): Promise<void> {
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
   * Get the commands provided by this plugin
   * Override this to provide plugin-specific commands
   */
  protected async getCommands(): Promise<Command[]> {
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
    if (this.isDebugEnabled()) {
      this.logger.debug(`[${this.id}] ${message}`, data);
    }
  }

  /**
   * Helper to log info messages
   */
  protected info(message: string, data?: unknown): void {
    this.logger.info(`[${this.id}] ${message}`, data);
  }

  /**
   * Helper to log warning messages
   */
  protected warn(message: string, data?: unknown): void {
    this.logger.warn(`[${this.id}] ${message}`, data);
  }

  /**
   * Helper to log error messages
   */
  protected error(message: string, error?: unknown): void {
    this.logger.error(`[${this.id}] ${message}`, error);
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
      handler: async (input, context): Promise<ToolResponse> => {
        this.debug(`Tool ${name} started`);
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
        this.debug(`Resource ${uri} started`);
        try {
          const result = await handler();
          this.debug(`Resource ${uri} completed`, { result });
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
  protected getContext(): TContext {
    if (!this.context) {
      throw new Error(`Plugin ${this.id}: Plugin not registered yet`);
    }
    return this.context;
  }

  /**
   * Helper method to format content using the context's template system
   */
  protected formatContent<T = unknown>(
    templateName: string,
    data: T,
    options?: { truncate?: number },
  ): string {
    const context = this.getContext();
    return context.formatContent(templateName, data, options);
  }

  /**
   * Helper method to parse content using the context's template system
   */
  protected parseContent<T = unknown>(
    templateName: string,
    content: string,
  ): T {
    const context = this.getContext();
    return context.parseContent<T>(templateName, content);
  }

  /**
   * Determine the permission level for a user in this plugin's context
   * Must be implemented by plugins that handle user permissions
   * Default implementation returns 'public' for safety
   */
  public determineUserPermissionLevel(_userId: string): UserPermissionLevel {
    return "public";
  }

  /**
   * Create a progress bridge that converts job queue ProgressReporter to MCP progress events
   * Used by job-based tools to report progress via MCP progressToken
   */
  protected createProgressBridge(
    progressToken?: string | number,
  ): ProgressReporter | undefined {
    if (!progressToken) return undefined;

    const context = this.context;
    if (!context) return undefined;

    const pluginId = this.id;
    return ProgressReporter.from(async (notification: ProgressNotification) => {
      await context.sendMessage(`plugin:${pluginId}:progress`, {
        progressToken,
        notification: {
          progress: notification.progress,
          total: notification.total,
          message: notification.message,
        },
      });
    });
  }
}
