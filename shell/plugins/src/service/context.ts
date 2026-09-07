import type { UserPermissionLevel } from "@brains/templates";
import type { BasePluginContext } from "../base/context";
import { createBasePluginContext } from "../base/context";
import type {
  BasePluginContext as PublicBasePluginContext,
  ServicePluginContext as PublicServicePluginContext,
} from "../public/types";
import type { IShell, PluginRegistrationContext } from "../interfaces";
import type { IWebRoutesNamespace } from "../interface/context";
import { createAINamespace } from "../entity/context";
import type {
  IEntitiesNamespace,
  IEntityAINamespace,
  IPromptsNamespace,
} from "../entity/context";
import {
  createEntitiesNamespace,
  createPromptsNamespace,
} from "../entity/namespaces";
import type {
  EntityBulkCoordination,
  EntityServiceClient,
} from "@brains/entity-service";
import { createEntityBulkCoordination } from "@brains/entity-service";
import {
  scopeTemplateName,
  type ContentGenerationBatchResult,
  type ContentGenerationTargetInput,
  type GenerationCaller,
  type ResolutionOptions,
} from "@brains/content-service";
import {
  SHELL_CHANNELS,
  type RuntimeInterfacePrincipalState,
} from "@brains/contracts";
import { createEnqueueJobFn } from "@brains/job-queue";
import type { ToolContext } from "@brains/mcp-service";
import { TemplateCapabilities } from "@brains/templates";
import type {
  ConfiguredPrincipalSeeds,
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

  /** Parsed by the template's own formatter; callers narrow what they read. */
  parse: (templateName: string, content: string) => unknown;

  /**
   * Resolve content from a template. Returns `unknown`: resolution validates
   * against the template's own schema, which a caller-chosen type parameter
   * has no relationship to.
   */
  resolve: (
    templateName: string,
    options?: ResolutionOptions,
  ) => Promise<unknown>;

  /**
   * Generate content from a template, parsed against that template's own
   * schema. The registry supplies the prompt and the schema, because the
   * template is what knows both. Named consumer: @brains/site-content.
   */
  generate: (
    templateName: string,
    context?: {
      prompt?: string | undefined;
      data?: Record<string, unknown> | undefined;
    },
  ) => Promise<unknown>;

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
  get: (name: string) => ViewTemplate | undefined;

  /** List all registered view templates */
  list: () => ViewTemplate[];

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
 * Includes: entity management, templates, views, prompt resolution, AI, messaging, jobs.
 * Excludes: MCP protocol registration, transport.
 */
export interface IServiceContentNamespace {
  generate(request: {
    /** Template names are local to this plugin; the runtime scopes them. */
    targets: ContentGenerationTargetInput[];
    /** The trusted caller and job attribution. Omission uses this plugin's own service authority. */
    toolContext?: ToolContext | undefined;
    force?: boolean;
    dryRun?: boolean;
    /** Request cancellation only; never persisted or owned by admitted jobs. */
    signal?: AbortSignal;
  }): Promise<ContentGenerationBatchResult>;
}

export interface IServiceRuntimePermissionsNamespace {
  /** Exact principals declared in brain configuration for bootstrap/recovery. */
  getConfiguredPrincipalSeeds(): ConfiguredPrincipalSeeds;
  /** Replace exact-principal runtime projection after loading auth.db. */
  replaceRuntimePrincipalState(state: RuntimeInterfacePrincipalState): void;
  /**
   * Permission level for a user on this declaration.
   *
   * A service that serves an authenticated route resolves its caller exactly
   * the way an interface does — one permission service answers both. Named
   * consumer: declarative service routes.
   */
  getUserLevel(declarationId: string, userId: string): UserPermissionLevel;
  isAnchor(declarationId: string, userId: string): boolean;
}

export type ServiceEntityService = EntityServiceClient;

/**
 * Also extends the service-specific slice of the published context (base
 * members are already checked by BasePluginContext's own extends), so a
 * published service capability the runtime lacks fails to compile here.
 */
export interface ServicePluginContext
  extends
    BasePluginContext,
    Omit<PublicServicePluginContext, keyof PublicBasePluginContext> {
  /** Auth-runtime projection hooks available only to service plugins. */
  readonly permissions: BasePluginContext["permissions"] &
    IServiceRuntimePermissionsNamespace;

  /** Full entity service with write operations */
  readonly entityService: ServiceEntityService;

  /**
   * Durable bulk-mutation coordination, bound to this plugin's id as the
   * mutation source. The only route to the durable-batch lifecycle;
   * `entityService` deliberately excludes it.
   */
  readonly entityCoordination: EntityBulkCoordination;

  /** Entity management namespace */
  readonly entities: IEntitiesNamespace;

  /** Template-backed content generation and persistence. */
  readonly content: IServiceContentNamespace;

  /** Template operations namespace (register, format, parse, resolve, getCapabilities) */
  readonly templates: IServiceTemplatesNamespace;

  /** Views namespace for view template access and rendering */
  readonly views: IViewsNamespace;

  /** Prompt resolution namespace */
  readonly prompts: IPromptsNamespace;

  /**
   * Read-only view of plugin-contributed web routes. Service plugins already
   * contribute routes via getWebRoutes(); this is the symmetric read side
   * (e.g. the dashboard deriving console surface links from what is mounted).
   */
  readonly webRoutes: IWebRoutesNamespace;

  /** AI generation namespace */
  readonly ai: IEntityAINamespace;

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
  const permissionService = shell.getPermissionService();

  return {
    ...baseContext,

    permissions: {
      ...baseContext.permissions,
      getConfiguredPrincipalSeeds: () =>
        permissionService.getConfiguredPrincipalSeeds(),
      replaceRuntimePrincipalState: (state): void =>
        permissionService.replaceRuntimePrincipalState(state),
      getUserLevel: (declarationId, userId): UserPermissionLevel =>
        permissionService.determineUserLevel(declarationId, userId),
      isAnchor: (declarationId, userId): boolean =>
        permissionService.isAnchor(declarationId, userId),
    },

    entityService,

    entityCoordination: createEntityBulkCoordination(entityService, pluginId),

    entities: createEntitiesNamespace(shell),

    webRoutes: {
      getRoutes: () => shell.getPluginWebRoutes(),
    },

    content: {
      generate: async ({
        targets,
        toolContext,
        force,
        dryRun,
        signal,
      }): Promise<ContentGenerationBatchResult> => {
        signal?.throwIfAborted();
        // The tool context is the trusted caller; without one, this plugin's
        // own configured service authority applies.
        const caller: GenerationCaller = toolContext
          ? {
              actor: toolContext.actor,
              permissionLevel: toolContext.userPermissionLevel ?? "public",
            }
          : {
              actor: { kind: "service", serviceId: pluginId },
              permissionLevel: permissionService.determineUserLevel(
                "service",
                pluginId,
              ),
            };
        const enqueueJob = createEnqueueJobFn(
          shell.getJobQueueService(),
          pluginId,
          false,
        );
        return contentService.submitGeneration(
          {
            caller,
            targets,
            pluginId,
            options: {
              ...(force !== undefined && { force }),
              ...(dryRun !== undefined && { dryRun }),
            },
          },
          {
            enqueue: (jobData, batchId) =>
              enqueueJob({
                type: SHELL_CHANNELS.contentGeneration,
                data: jobData,
                toolContext: toolContext ?? null,
                options: {
                  source: pluginId,
                  rootJobId: batchId,
                  // At most once. A job whose worker died is marked failed on
                  // reclaim instead of re-run, so output is never regenerated
                  // or resurrected; re-submitting skips what exists.
                  maxRetries: 0,
                  metadata: { operationType: "content_operations", pluginId },
                },
              }),
          },
          signal,
        );
      },
    },

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
      parse: (templateName: string, content: string): unknown =>
        contentService.parseContent(templateName, content, pluginId),
      resolve: async (
        templateName: string,
        options?: ResolutionOptions,
      ): Promise<unknown> =>
        contentService.resolveContent(templateName, options, pluginId),
      generate: async (
        templateName: string,
        generationContext?: {
          prompt?: string | undefined;
          data?: Record<string, unknown> | undefined;
        },
      ): Promise<unknown> =>
        contentService.generateContent(
          templateName,
          {
            ...(generationContext?.prompt !== undefined
              ? { prompt: generationContext.prompt }
              : {}),
            ...(generationContext?.data !== undefined
              ? { data: generationContext.data }
              : {}),
          },
          pluginId,
        ),
      getCapabilities: (
        templateName: string,
      ): {
        canGenerate: boolean;
        canFetch: boolean;
        canRender: boolean;
        isStaticOnly: boolean;
      } | null => {
        const template = shell.getTemplate(
          scopeTemplateName(templateName, pluginId),
        );
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
      get: (name: string): ViewTemplate | undefined => {
        return renderService.get(name) ?? undefined;
      },
      list: (): ViewTemplate[] => {
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

    ai: createAINamespace(shell),

    registerInstructions: (instructions: string): void => {
      shell.registerInstructions(pluginId, instructions);
    },
  };
}
