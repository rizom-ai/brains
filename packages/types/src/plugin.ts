import { z, type ZodRawShape } from "zod";
import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { Registry } from "./registry";
import type { MessageBus } from "./messaging";
import type { SchemaFormatter, ContentFormatter } from "./formatters";
import type { EntityAdapter } from "@brains/base-entity";
import type { BaseEntity } from "./entities";
import type { EntityService } from "./services";
import type { ContentTypeRegistry } from "./content";

/**
 * Options for content generation
 */
export interface ContentGenerateOptions<T> {
  schema: z.ZodType<T>;
  prompt: string;
  contentType: string;
  context?: {
    entities?: BaseEntity[];
    data?: Record<string, unknown>;
    examples?: T[];
    style?: string;
  };
}

/**
 * Content template for reusable generation patterns
 */
export interface ContentTemplate<T = unknown> {
  name: string;
  description: string;
  schema: z.ZodType<T>;
  basePrompt: string;
  /**
   * Optional formatter for converting between structured data and human-editable markdown.
   * If not provided, a default YAML formatter will be used.
   */
  formatter?: ContentFormatter<T>;
  /**
   * For collection content types that contain multiple items.
   * Each item is itself a ContentTemplate.
   */
  items?: {
    [itemKey: string]: ContentTemplate<unknown>;
  };
}

/**
 * Options for batch content generation
 */
export interface BatchGenerateOptions<T> {
  schema: z.ZodType<T>;
  contentType: string;
  items: Array<{
    prompt: string;
    context?: Record<string, unknown>;
  }>;
}

/**
 * Plugin metadata schema - validates the data portion of a plugin
 */
export const pluginMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
});

/**
 * Progress notification for long-running operations
 */
export interface ProgressNotification {
  progress: number;
  total?: number;
  message?: string;
}

/**
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (
    input: unknown,
    context?: {
      progressToken?: string | number;
      sendProgress?: (notification: ProgressNotification) => Promise<void>;
    },
  ) => Promise<unknown>;
}

/**
 * Plugin resource definition
 */
export interface PluginResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{
    contents: Array<{
      text: string;
      uri: string;
      mimeType?: string;
    }>;
  }>;
}

/**
 * Plugin capabilities that can be exposed
 */
export interface PluginCapabilities {
  tools: PluginTool[];
  resources: PluginResource[];
}

/**
 * Plugin interface - combines validated metadata with the register function
 */
export type Plugin = z.infer<typeof pluginMetadataSchema> & {
  register(context: PluginContext): Promise<PluginCapabilities>;
};

/**
 * Minimal formatter registry interface for plugins
 */
export interface FormatterRegistry {
  register(schemaName: string, formatter: SchemaFormatter): void;
}

/**
 * Plugin context passed to plugins during registration
 * Provides access to the registry and other shared services
 */
export interface PluginContext {
  pluginId: string;
  registry: Registry;
  logger: Logger;
  getPlugin: (id: string) => Plugin | undefined;
  events: EventEmitter;
  messageBus: MessageBus;
  formatters: FormatterRegistry;
  contentTypes: {
    register(
      contentType: string,
      schema: z.ZodType<unknown>,
      formatter?: ContentFormatter<unknown>,
    ): void;
    list(): string[];
  };
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ) => void;
  generateContent: <T>(options: ContentGenerateOptions<T>) => Promise<T>;
  // Direct service access
  entityService: EntityService;
  contentTypeRegistry: ContentTypeRegistry;
}
