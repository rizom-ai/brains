import { z, type ZodRawShape } from "zod";
import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { Registry } from "./registry";
import type { MessageBus } from "./messaging";
import type { SchemaFormatter } from "./formatters";
import type { EntityAdapter } from "@brains/base-entity";
import type { BaseEntity } from "./entities";

/**
 * Options for content generation
 */
export interface ContentGenerateOptions<T> {
  schema: z.ZodType<T>;
  prompt: string;
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
}

/**
 * Options for batch content generation
 */
export interface BatchGenerateOptions<T> {
  schema: z.ZodType<T>;
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
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (input: unknown) => Promise<unknown>;
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
  registry: Registry;
  logger: Logger;
  getPlugin: (id: string) => Plugin | undefined;
  events: EventEmitter;
  messageBus: MessageBus;
  formatters: FormatterRegistry;
  query: <T>(query: string, schema: z.ZodType<T>) => Promise<T>;
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ) => void;
  generateContent: <T>(options: ContentGenerateOptions<T>) => Promise<T>;
}
