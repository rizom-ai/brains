import { z, type ZodRawShape } from "zod";
import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { Registry } from "./registry";
import type { MessageBus } from "./messaging";

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

import type { SchemaFormatter } from "./formatters";

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
}
