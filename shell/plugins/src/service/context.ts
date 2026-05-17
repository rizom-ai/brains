import type { BasePluginContext } from "../base/context";
import { createBasePluginContext } from "../base/context";
import type { IShell, PluginRegistrationContext } from "../interfaces";
import type { IEntitiesNamespace, IPromptsNamespace } from "../entity/context";
import {
  createEntitiesNamespace,
  createPromptsNamespace,
} from "../entity/namespaces";
import type { IEntityService } from "@brains/entity-service";
import type { ResolutionOptions } from "@brains/content-service";
import { TemplateCapabilities } from "@brains/templates";
import type {
  OutputFormat,
  Renderer,
  Template,
  ViewTemplate,
} from "@brains/templates";

/**
 * Template operations namespace for ServicePluginContext
 * Includes registration, formatting, parsing, resolution, and capability checking
 */
export interface IServiceTemplatesNamespace {
  /** Register templates for this plugin or an explicit template namespace */
  register: (templates: Record<string, Template>, namespace?: string) => void;

  /** Format data using a template formatter */
  format: <T = unknown>(templateName: string, data: T) => string;

  /** Parse content using a template parser */
  parse: <T = unknown>(templateName: string, content: string) => T;

  /** Resolve content from a template (may fetch or generate) */
  resolve: <T = unknown>(
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<T | null>;

  /** Get capabilities of a template */
  getCapabilities: (templateName: string) => {
    canGenerate: boolean;
    canFetch: boolean;
    canRender: boolean;
    isStaticOnly: boolean;
  } | null;
}

/**
 * Views namespace — view template access and rendering utilities
 */
export interface IViewsNamespace {
  /** Get a view template by name */
  get: (name: string) => ViewTemplate<unknown> | undefined;

  /** List all registered view templates */
  list: () => ViewTemplate<unknown>[];

  /** Check if a template has a renderer for the requested format (defaults to web). */
  hasRenderer: (templateName: string, format?: OutputFormat) => boolean;

  /** Get the renderer for a template and format (defaults to web). */
  getRenderer: (
    templateName: string,
    format?: OutputFormat,
  ) => Renderer | undefined;

  /** Validate content against a template's schema */
  validate: (templateName: string, content: unknown) => boolean;
}

/**
 * Context for service plugins.
 *
 * Includes: entity management, templates, views, prompt resolution, messaging, jobs.
 * Excludes: AI generation, MCP protocol registration, transport.
 */
export interface ServicePluginContext extends BasePluginContext {
  /** Full entity service with write operations */
  readonly entityService: IEntityService;

  /** Entity management namespace */
  readonly entities: IEntitiesNamespace;

  /** Template operations namespace (register, format, parse, resolve, getCapabilities) */
  readonly templates: IServiceTemplatesNamespace;

  /** Views namespace for view template access and rendering */
  readonly views: IViewsNamespace;

  /** Prompt resolution namespace */
  readonly prompts: IPromptsNamespace;

  /** Register or update plugin instructions for the agent system prompt */
  registerInstructions: (instructions: string) => void;
}

/**
 * Create a ServicePluginContext from the shell.
 */
export function createServicePluginContext(
  shell: IShell,
  pluginId: string,
  registrationContext?: PluginRegistrationContext,
): ServicePluginContext {
  const baseContext = createBasePluginContext(
    shell,
    pluginId,
    registrationContext,
  );
  const entityService = shell.getEntityService();
  const renderService = shell.getRenderService();
  const contentService = shell.getContentService();

  return {
    ...baseContext,

    entityService,

    entities: createEntitiesNamespace(shell),

    templates: {
      register: (
        templates: Record<string, Template>,
        namespace?: string,
      ): void => {
        shell.registerTemplates(templates, namespace ?? pluginId);
      },
      format: <T = unknown>(templateName: string, data: T): string => {
        return contentService.formatContent(templateName, data, { pluginId });
      },
      parse: <T = unknown>(templateName: string, content: string): T => {
        return contentService.parseContent(templateName, content, pluginId);
      },
      resolve: async <T = unknown>(
        templateName: string,
        options?: ResolutionOptions,
      ): Promise<T | null> => {
        const result = await contentService.resolveContent(
          templateName,
          options,
          pluginId,
        );
        return result as T;
      },
      getCapabilities: (
        templateName: string,
      ): {
        canGenerate: boolean;
        canFetch: boolean;
        canRender: boolean;
        isStaticOnly: boolean;
      } | null => {
        const scopedTemplateName = templateName.includes(":")
          ? templateName
          : `${pluginId}:${templateName}`;
        const template = shell.getTemplate(scopedTemplateName);
        if (!template) return null;
        const capabilities = TemplateCapabilities.getCapabilities(template);
        return {
          canGenerate: capabilities.canGenerate,
          canFetch: capabilities.canFetch,
          canRender: capabilities.canRender,
          isStaticOnly: capabilities.isStaticOnly,
        };
      },
    },

    views: {
      get: (name: string): ViewTemplate<unknown> | undefined => {
        return renderService.get(name) ?? undefined;
      },
      list: (): ViewTemplate<unknown>[] => {
        return renderService.list();
      },
      hasRenderer: (
        templateName: string,
        format: OutputFormat = "web",
      ): boolean => {
        return renderService.hasRenderer(templateName, format);
      },
      getRenderer: (
        templateName: string,
        format: OutputFormat = "web",
      ): Renderer | undefined => {
        return renderService.getRenderer(templateName, format);
      },
      validate: (templateName: string, content: unknown): boolean => {
        return renderService.validate(templateName, content);
      },
    },

    prompts: createPromptsNamespace(entityService),

    registerInstructions: (instructions: string): void => {
      shell.registerInstructions(pluginId, instructions);
    },
  };
}
