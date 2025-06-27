import { z, type ZodRawShape } from "zod";
import type { Logger } from "@brains/utils";
import type { EventEmitter } from "events";
import type { ContentFormatter } from "./formatters";
import type { EntityAdapter } from "@brains/base-entity";
import type { BaseEntity } from "./entities";

import type { VNode } from "preact";

/**
 * Component type for layouts - using Preact
 * Returns a Preact VNode
 */
export type ComponentType<P = unknown> = (props: P) => VNode;

import type { RouteDefinition, SectionDefinition, ViewTemplate } from "./views";
import type { EntityService } from "./services";

/**
 * Context for content generation - simplified for template-based approach
 */
export interface GenerationContext {
  prompt?: string;
  data?: Record<string, unknown>;
}

/**
 * Template for reusable generation patterns and view rendering
 */
export interface Template<T = unknown> {
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
   * Optional layout definition for rendering this content type.
   * If provided, the template can be used as a section layout.
   */
  layout?: {
    component: ComponentType<T> | string; // Component function or path string
    description?: string;
    interactive?: boolean; // Whether this layout requires client-side interactivity
    packageName?: string; // Package name for hydration script resolution
  };
}

/**
 * Zod schema for Template validation (used in plugin configurations)
 */
export const TemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  schema: z.any(), // ZodType can't be validated at runtime - required
  basePrompt: z.string(),
  formatter: z.any().optional(), // ContentFormatter instance
  layout: z
    .object({
      component: z.any(), // ComponentType or string
      description: z.string().optional(),
      interactive: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Plugin metadata schema - validates the data portion of a plugin
 */
export const pluginMetadataSchema = z.object({
  id: z.string(),
  version: z.string(),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  packageName: z.string(), // Package name for import resolution (e.g., "@brains/site-builder-plugin")
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
 * Tool visibility levels for permission control
 */
export type ToolVisibility = "public" | "anchor";

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
  visibility?: ToolVisibility; // Default: "anchor" for safety - only explicitly marked tools are public
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
 * Plugin context passed to plugins during registration
 * Provides clean, minimal interface following principle of least privilege
 */
export interface PluginContext {
  pluginId: string;
  logger: Logger;
  events: EventEmitter;
  registerEntityType: <T extends BaseEntity>(
    entityType: string,
    schema: z.ZodType<T>,
    adapter: EntityAdapter<T>,
  ) => void;
  generateContent: <T = unknown>(
    templateName: string,
    context?: GenerationContext,
  ) => Promise<T>;
  parseContent: <T = unknown>(templateName: string, content: string) => T;
  generateWithRoute: (
    route: RouteDefinition,
    section: SectionDefinition,
    progressInfo: { current: number; total: number; message: string },
    additionalContext?: Record<string, unknown>,
  ) => Promise<string>;
  // Unified template registration - registers template for both content generation and view rendering
  registerTemplate: <T>(name: string, template: Template<T>) => void;
  // Convenience method for registering multiple templates at once
  registerTemplates: (templates: Record<string, Template>) => void;
  // Route registration
  registerRoutes: (
    routes: RouteDefinition[],
    options?: { environment?: string },
  ) => void;
  // View template access (replaces direct viewRegistry access)
  getViewTemplate: (name: string) => ViewTemplate | undefined;
  
  // Route finding abstraction
  getRoute: (path: string) => RouteDefinition | undefined;
  findRoute: (filter: {
    id?: string;
    pluginId?: string;
    pathPattern?: string;
  }) => RouteDefinition | undefined;
  listRoutes: () => RouteDefinition[]; // for tool use only
  validateRoute: (route: RouteDefinition) => boolean;
  
  // Template finding abstraction
  findViewTemplate: (filter: {
    name?: string;
    pluginId?: string;
    namePattern?: string;
  }) => ViewTemplate | undefined;
  listViewTemplates: () => ViewTemplate[]; // for tool use only
  validateTemplate: (templateName: string, content: unknown) => boolean;
  // Plugin metadata access (scoped to current plugin by default)
  getPluginPackageName: (pluginId?: string) => string | undefined;
  // Entity service access - direct access to public service interface
  entityService: EntityService;
}
