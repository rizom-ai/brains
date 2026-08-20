import { AsyncLocalStorage } from "node:async_hooks";
import { PUBLISH_CHANNELS, type JsonObject } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "../system-channels";
import type { JobHandler, JobInfo } from "@brains/job-queue";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  createConfirmationGate,
  type Prompt,
  type Resource,
  type Tool,
  type ToolContext,
  type ToolResponse,
} from "@brains/mcp-service";
import {
  createTemplate,
  type ComponentType,
  type Template,
} from "@brains/templates";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import type {
  PluginCapabilities,
  PluginRegistrationContext,
  IShell,
} from "../interfaces";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { createDeclarativeCmsWorkspaceRegistration } from "../operator/cms-workspace-runtime";
import { createDeclarativeDashboardWidgetRegistration } from "../operator/dashboard-widget-runtime";
import type {
  AnyCmsWorkspaceDefinition,
  AnyDashboardWidgetDefinition,
  BoundCmsWorkspace,
  BoundDashboardWidget,
} from "../operator/operator-definition-contract";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import { createEvalFixtures } from "../entity/eval-fixtures";
import { createJobEntityAccess } from "../job/job-entity-access";
import { ServicePlugin } from "./service-plugin";
import type { ServicePluginContext } from "./context";
import type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  NormalizedServiceDefinitionInput,
  ServiceJobBinding,
  ServiceJobReference,
  ServiceJobStatus,
  ServiceJobs,
  ServicePromptDefinition,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateDefinition,
  ServiceTemplateFormatter,
  ServiceViewDefinition,
} from "./service-definition-contract";
import {
  getServiceJobHandler,
  parseServiceDeadline,
} from "./service-definition-contract";
import {
  bindServiceJobRuntimeType,
  unbindServiceJobRuntimeType,
} from "./job-definition-runtime";

const confirmationTokenField = "_rizomConfirmationToken";

function formatTemplateValue(
  template: ServiceTemplateDefinition<ServiceSchema>,
  value: unknown,
): string {
  return template.format({ value: template.schema.parse(value) });
}

function toolConfirmationToken(input: unknown): string | undefined {
  if (input === null || typeof input !== "object") return undefined;
  const token = Reflect.get(input, confirmationTokenField);
  return typeof token === "string" ? token : undefined;
}

function promptInput(value: string | undefined): unknown {
  if (value === undefined) return {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function statusFor<TDefinition extends AnyServiceJobDefinition>(
  definition: TDefinition,
  job: JobInfo,
): ServiceJobStatus<z.output<TDefinition["output"]>> {
  const result: z.output<TDefinition["output"]> | undefined =
    job.status === "completed" && job.result !== undefined
      ? (definition.output.parse(job.result) as z.output<TDefinition["output"]>)
      : undefined;
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    ...(result !== undefined ? { result } : {}),
    ...(job.lastError ? { error: job.lastError } : {}),
  };
}

function runtimeJobHandler(
  binding: ServiceJobBinding,
  context: ServicePluginContext,
  templates: ServiceTemplateFormatter,
  owned: ReadonlySet<AnyEntityDefinition>,
  serviceId: string,
  templateName: (localName: string) => string,
): JobHandler<string, unknown, unknown> {
  const definition = binding.definition;
  const handler = getServiceJobHandler(binding);
  return {
    ...(definition.deadline
      ? { executionTimeoutMs: parseServiceDeadline(definition.deadline) }
      : {}),
    validateAndParse(data): unknown | null {
      const parsed = definition.input.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    async process(
      input: unknown,
      _jobId: string,
      progress: ProgressReporter,
      signal: AbortSignal,
    ): Promise<unknown> {
      const output = await handler({
        input,
        signal,
        progress,
        templates,
        entities: createJobEntityAccess(
          context.entityService,
          new Set([...owned].map(({ type }) => type)),
          serviceId,
        ),
        ai: context.ai,
        logger: context.logger,
        conversations: context.conversations,
        identity: context.identity,
        template: templateName,
        uploads: context.uploads.scoped({
          // The runtime's own namespace, not the interface that happened to
          // receive the file: only the namespace decides which bytes a read
          // returns, and a job reads what it was handed.
          namespace: "upload",
          refKind: "upload",
          routePath: "/api/uploads",
        }),
        messaging: {
          async publish(message): Promise<void> {
            await context.messaging.send({
              type: message.topic,
              payload: message.data,
            });
          },
        },
      });
      return definition.output.parse(output);
    },
  };
}

class DeclarativeServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> extends ServicePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings
  >;
  private readonly publicId: string;
  private readonly toolContext = new AsyncLocalStorage<ToolContext>();
  private readonly cleanups: Array<() => void | Promise<void>> = [];
  private readonly registeredJobs = new Set<AnyServiceJobDefinition>();
  private readonly operatorAbortController = new AbortController();
  private readonly registeredCmsWorkspaceIds: string[] = [];
  private readonly registeredDashboardWidgetIds: string[] = [];
  private accountSettingsRegistration:
    AccountSettingsRegistration<NonNullable<TAccountSettings>> | undefined;
  private cmsWorkspaceBindings: readonly BoundCmsWorkspace<
    AnyCmsWorkspaceDefinition,
    z.output<TConfigSchema>,
    TState,
    TAccountSettings
  >[] = [];
  private dashboardWidgetBindings: readonly BoundDashboardWidget<
    AnyDashboardWidgetDefinition,
    z.output<TConfigSchema>,
    TState,
    TAccountSettings
  >[] = [];
  private readonly scope: (localId: string) => string;
  private scopedShell: IShell | undefined;
  private state: TState | undefined;
  private tools: Tool[] | undefined;
  private resources: Resource[] | undefined;

  constructor(
    definition: NormalizedServiceDefinitionInput<
      TConfigSchema,
      TState,
      TPromptSchemas,
      TTemplateSchemas,
      TViewSchemas,
      TAccountSettings
    >,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
    scope: (localId: string) => string,
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.definition = definition;
    this.publicId = definition.id;
    this.scope = scope;
  }

  /**
   * Where a template this package declared ends up once the runtime scopes
   * it. Templates are declared on an entity and registered under that
   * entity plugin's id, so the lookup goes through the declaring entity.
   */
  private scopedTemplateName(localName: string): string {
    const owner = (this.definition.entities ?? []).find(({ templates }) =>
      Object.hasOwn(templates ?? {}, localName),
    );
    if (!owner) {
      throw new Error(
        `No declared entity provides a template named "${localName}"`,
      );
    }
    return `${this.scope(owner.type)}:${localName}`;
  }

  public override register(
    shell: IShell,
    registrationContext?: PluginRegistrationContext,
  ): Promise<PluginCapabilities> {
    this.scopedShell = shell;
    return super.register(shell, registrationContext);
  }

  protected override async onRegister(
    context: ServicePluginContext,
  ): Promise<void> {
    await super.onRegister(context);
    if (this.definition.accountSettings && !context.executionOnly) {
      this.accountSettingsRegistration = context.accountSettings.register({
        ownerPluginId: this.id,
        packageName: this.packageName,
        definitionId: this.definition.id,
        definition: this.definition.accountSettings,
      });
    }
    this.state = this.definition.setup
      ? await this.definition.setup({
          config: this.config,
          lifecycle: {
            onCleanup: (cleanup): void => {
              this.cleanups.push(cleanup);
            },
          },
        })
      : (Object.freeze({}) as TState);

    const templates = this.templateFormatter();
    context.templates.register(this.runtimeTemplates(), this.id);
    this.registerPrompts();

    const insights =
      this.definition.insights?.({
        config: this.config,
        state: this.state,
      }) ?? {};
    for (const [insightId, handler] of Object.entries(insights)) {
      context.insights.register(insightId, async (_service, visibilityScope) =>
        handler({
          entities: createJobEntityAccess(
            context.entityService,
            new Set((this.definition.entities ?? []).map(({ type }) => type)),
            this.publicId,
          ),
          visibilityScope,
        }),
      );
    }

    const ownedTypes = (this.definition.entities ?? []).map(({ type }) => type);
    const evals =
      this.definition.evals?.({
        config: this.config,
        state: this.state,
        template: (localName) => this.scopedTemplateName(localName),
      }) ?? {};
    for (const [handlerId, handler] of Object.entries(evals)) {
      context.eval.registerHandler(handlerId, (input) =>
        handler(input, {
          ai: context.ai,
          logger: this.logger,
          entities: createJobEntityAccess(
            context.entityService,
            new Set(ownedTypes),
            this.publicId,
          ),
          conversations: context.conversations,
          runProjectionRule: (rule) => context.eval.runProjectionRule(rule),
          fixtures: createEvalFixtures(context.entityService, ownedTypes),
          template: (localName) => this.scopedTemplateName(localName),
        }),
      );
    }

    const bindings =
      this.definition.jobs?.({ config: this.config, state: this.state }) ?? [];
    const names = new Set<string>();
    for (const binding of bindings) {
      const job = binding.definition;
      if (names.has(job.name)) {
        throw new Error(
          `Service "${this.publicId}" registers job "${job.name}" more than once`,
        );
      }
      names.add(job.name);
      this.registeredJobs.add(job);
      bindServiceJobRuntimeType(job, `${this.id}:${job.name}`);
      context.jobs.registerHandler(
        job.name,
        runtimeJobHandler(
          binding,
          context,
          templates,
          new Set(this.definition.entities ?? []),
          this.publicId,
          (localName) => this.scopedTemplateName(localName),
        ),
      );
    }

    this.registerPublishProviders(context);
  }

  /**
   * Announce declared publish providers once the pipeline is listening.
   *
   * Same deferral the entity-side slot makes — the publish pipeline has to
   * have subscribed to publish:register before anything announces to it.
   */
  private registerPublishProviders(context: ServicePluginContext): void {
    const declarations =
      this.definition.publish?.({
        config: this.config,
        state: this.requireState(),
        logger: this.logger,
      }) ?? [];
    if (declarations.length === 0) return;

    context.messaging.subscribe(
      SYSTEM_CHANNELS.pluginsRegistered,
      async (): Promise<{ success: true }> => {
        for (const declaration of declarations) {
          await context.messaging.send({
            type: PUBLISH_CHANNELS.register,
            payload: {
              entityType: declaration.entityType,
              provider: declaration.provider,
              config: {
                ...(declaration.resultIdField === undefined
                  ? {}
                  : { publishResultIdField: declaration.resultIdField }),
                ...(declaration.timestampField === undefined
                  ? {}
                  : { publishTimestampField: declaration.timestampField }),
              },
            },
          });
        }
        return { success: true };
      },
    );
  }

  protected override async onRegistrationComplete(
    context: ServicePluginContext,
  ): Promise<void> {
    if (
      this.definition.accountSettings &&
      !context.executionOnly &&
      !context.accountSettings.hasBackend()
    ) {
      throw new Error(
        `Service "${this.publicId}" account settings require auth-service and an account settings encryption key`,
      );
    }
    if (context.executionOnly) return;
    this.bindOperatorDefinitions(context);

    const acquiredCms: string[] = [];
    const acquiredDashboard: string[] = [];
    try {
      for (const binding of this.cmsWorkspaceBindings) {
        const runtimeWorkspaceId = `${this.id}:${binding.definition.id}`;
        const registration = createDeclarativeCmsWorkspaceRegistration({
          publicServiceId: this.publicId,
          packageName: this.packageName,
          runtimeWorkspaceId,
          config: this.config,
          state: this.requireState(),
          ...(this.accountSettingsRegistration
            ? {
                accountSettingsRegistration: this.accountSettingsRegistration,
              }
            : {}),
          binding,
          context,
          runtimeSignal: this.operatorAbortController.signal,
        });
        try {
          const result = await context.cms.registerWorkspace(registration);
          if (result === false) {
            await this.rollbackCmsWorkspaces(context, acquiredCms);
            acquiredCms.splice(0);
            break;
          }
        } catch (error) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" CMS workspace "${binding.definition.id}" host registration failed; correct the declaration or CMS configuration: ${getErrorMessage(error)}`,
            { cause: error },
          );
        }
        acquiredCms.push(runtimeWorkspaceId);
      }
      this.registeredCmsWorkspaceIds.push(...acquiredCms);

      for (const binding of this.dashboardWidgetBindings) {
        const registration = createDeclarativeDashboardWidgetRegistration({
          publicServiceId: this.publicId,
          packageName: this.packageName,
          config: this.config,
          state: this.requireState(),
          ...(this.accountSettingsRegistration
            ? {
                accountSettingsRegistration: this.accountSettingsRegistration,
              }
            : {}),
          binding,
          context,
          runtimeSignal: this.operatorAbortController.signal,
        });
        try {
          const registered =
            await context.dashboard.registerWidget(registration);
          if (!registered) {
            await this.rollbackDashboardWidgets(context, acquiredDashboard);
            acquiredDashboard.splice(0);
            break;
          }
        } catch (error) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" dashboard widget "${binding.definition.id}" host registration failed; correct the declaration or Dashboard configuration: ${getErrorMessage(error)}`,
            { cause: error },
          );
        }
        acquiredDashboard.push(binding.definition.id);
      }
      this.registeredDashboardWidgetIds.push(...acquiredDashboard);
    } catch (error) {
      await this.rollbackDashboardWidgets(context, acquiredDashboard);
      await this.rollbackCmsWorkspaces(context, acquiredCms);
      throw error;
    }
  }

  protected override async getTools(): Promise<Tool[]> {
    if (this.tools) return this.tools;
    const state = this.requireState();
    const definitions =
      this.definition.tools?.({
        config: this.config,
        state,
        jobs: this.jobs(),
        templates: this.templateFormatter(),
      }) ?? [];
    const names = new Set<string>();
    this.tools = definitions.map((definition) => {
      if (names.has(definition.name)) {
        throw new Error(
          `Service "${this.publicId}" defines tool "${definition.name}" more than once`,
        );
      }
      names.add(definition.name);
      return this.runtimeTool(definition);
    });
    return this.tools;
  }

  protected override async getResources(): Promise<Resource[]> {
    if (this.resources) return this.resources;
    const definitions =
      this.definition.resources?.({
        config: this.config,
        state: this.requireState(),
      }) ?? {};
    this.resources = Object.entries(definitions).map(([name, definition]) =>
      this.runtimeResource(name, definition),
    );
    return this.resources;
  }

  protected override async getInstructions(): Promise<string | undefined> {
    return this.definition.instructions?.({
      config: this.config,
      state: this.requireState(),
    });
  }

  protected override async onShutdown(): Promise<void> {
    this.operatorAbortController.abort(
      new Error(`Service "${this.publicId}" is shutting down`),
    );
    await this.rollbackDashboardWidgets(
      this.getContext(),
      this.registeredDashboardWidgetIds.splice(0),
    );
    await this.rollbackCmsWorkspaces(
      this.getContext(),
      this.registeredCmsWorkspaceIds.splice(0),
    );
    this.cmsWorkspaceBindings = [];
    this.dashboardWidgetBindings = [];
    this.tools = undefined;
    this.resources = undefined;
    for (const job of this.registeredJobs) {
      unbindServiceJobRuntimeType(job, `${this.id}:${job.name}`);
    }
    this.registeredJobs.clear();
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      await cleanup();
    }
  }

  private bindOperatorDefinitions(context: ServicePluginContext): void {
    if (this.definition.dashboardWidgets && context.dashboard.isAvailable()) {
      const bindings = this.definition.dashboardWidgets({
        config: this.config,
        state: this.requireState(),
        accountSettings: this.definition.accountSettings,
      });
      const ids = new Set<string>();
      for (const binding of bindings) {
        const id = binding.definition.id;
        if (ids.has(id)) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" registers dashboard widget "${id}" more than once; return each local widget definition once`,
          );
        }
        ids.add(id);
      }
      this.dashboardWidgetBindings = Object.freeze([...bindings]);
    }

    if (this.definition.cmsWorkspaces && context.cms.isAvailable()) {
      const bindings = this.definition.cmsWorkspaces({
        config: this.config,
        state: this.requireState(),
        accountSettings: this.definition.accountSettings,
      });
      const ids = new Set<string>();
      for (const binding of bindings) {
        const id = binding.definition.id;
        if (ids.has(id)) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" registers CMS workspace "${id}" more than once; return each local workspace definition once`,
          );
        }
        ids.add(id);
      }
      this.cmsWorkspaceBindings = Object.freeze([...bindings]);
    }
  }

  private async rollbackCmsWorkspaces(
    context: ServicePluginContext,
    workspaceIds: readonly string[],
  ): Promise<void> {
    for (const workspaceId of [...workspaceIds].reverse()) {
      try {
        await context.cms.unregisterWorkspace(workspaceId);
      } catch (error) {
        this.logger.error("Failed to unregister declarative CMS workspace", {
          serviceId: this.publicId,
          packageName: this.packageName,
          workspaceId,
          error: getErrorMessage(error),
        });
      }
      const index = this.registeredCmsWorkspaceIds.lastIndexOf(workspaceId);
      if (index >= 0) this.registeredCmsWorkspaceIds.splice(index, 1);
    }
  }

  private async rollbackDashboardWidgets(
    context: ServicePluginContext,
    widgetIds: readonly string[],
  ): Promise<void> {
    for (const widgetId of [...widgetIds].reverse()) {
      try {
        await context.dashboard.unregisterWidget(widgetId);
      } catch (error) {
        this.logger.error("Failed to unregister declarative dashboard widget", {
          serviceId: this.publicId,
          packageName: this.packageName,
          widgetId,
          error: getErrorMessage(error),
        });
      }
      const index = this.registeredDashboardWidgetIds.lastIndexOf(widgetId);
      if (index >= 0) this.registeredDashboardWidgetIds.splice(index, 1);
    }
  }

  private requireState(): TState {
    if (this.state === undefined) {
      throw new Error(`Service "${this.publicId}" has not completed setup`);
    }
    return this.state;
  }

  private jobs(): ServiceJobs {
    const context = this.getContext();
    return {
      enqueue: async <TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        input: z.input<TDefinition["input"]>,
      ): Promise<ServiceJobReference<TDefinition>> => {
        if (!this.registeredJobs.has(definition)) {
          throw new Error(
            `Service "${this.publicId}" cannot enqueue unregistered job "${definition.name}"`,
          );
        }
        const data = definition.input.parse(input);
        const toolContext = this.toolContext.getStore();
        const maxRetries = definition.retry
          ? definition.retry.attempts - 1
          : undefined;
        const id = await context.jobs.enqueue({
          type: definition.name,
          data,
          ...(toolContext ? { toolContext } : {}),
          options: {
            source: this.id,
            metadata: {
              operationType: "data_processing",
              pluginId: this.id,
            },
            ...(maxRetries !== undefined ? { maxRetries } : {}),
          },
        });
        return Object.freeze({
          id,
          status: async () => {
            const job = await context.jobs.getStatus(id);
            return job ? statusFor(definition, job) : null;
          },
        });
      },
      async status<TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        id: string,
      ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null> {
        const job = await context.jobs.getStatus(id);
        return job ? statusFor(definition, job) : null;
      },
    };
  }

  private templateFormatter(): ServiceTemplateFormatter {
    const templates = this.definition.templates as
      Record<string, ServiceTemplateDefinition<ServiceSchema>> | undefined;
    return {
      format(name, value): string {
        const template = templates?.[name];
        if (!template) throw new Error(`Template not found: ${name}`);
        return formatTemplateValue(template, value);
      },
    };
  }

  private runtimeTemplates(): Record<string, Template> {
    const templates = this.definition.templates as
      Record<string, ServiceTemplateDefinition<ServiceSchema>> | undefined;
    const views = this.definition.views as
      Record<string, ServiceViewDefinition<ServiceSchema>> | undefined;
    const result: Record<string, Template> = {};
    const names = new Set([
      ...Object.keys(templates ?? {}),
      ...Object.keys(views ?? {}),
    ]);

    for (const name of names) {
      const template = templates?.[name];
      const view = views?.[name];
      if (template && view && template.schema !== view.schema) {
        throw new Error(
          `Service "${this.publicId}" template and view "${name}" must share one schema`,
        );
      }
      const schema = template?.schema ?? view?.schema;
      if (!schema) continue;
      const base = {
        name,
        description: view?.description ?? `${this.publicId} ${name}`,
        schema,
        requiredPermission: "admin" as const,
        ...(template
          ? {
              formatter: {
                format: (value: unknown): string =>
                  formatTemplateValue(template, value),
                parse: (): never => {
                  throw new Error(`Template "${name}" is format-only`);
                },
              },
            }
          : {}),
      };
      if (!view) {
        result[name] = createTemplate(base);
        continue;
      }
      const component = ((value: JsonObject) => {
        const parsed = view.schema.parse(value);
        return typeof view.renderers.web === "function"
          ? view.renderers.web(parsed)
          : view.renderers.web;
      }) as unknown as ComponentType<JsonObject>;
      result[name] = createTemplate<JsonObject>({
        ...base,
        schema: schema as z.ZodType<JsonObject, unknown>,
        layout: { component },
      });
    }
    return result;
  }

  private registerPrompts(): void {
    const shell = this.scopedShell;
    if (!shell) throw new Error(`Service "${this.publicId}" has no shell`);
    const prompts = this.definition.prompts as
      Record<string, ServicePromptDefinition<ServiceSchema>> | undefined;
    for (const [name, definition] of Object.entries(prompts ?? {})) {
      const prompt: Prompt = {
        name: `${this.publicId}_${name}`,
        ...(definition.description
          ? { description: definition.description }
          : {}),
        args: {
          input: {
            description: "JSON input",
            required: true,
          },
        },
        handler: async (args) => {
          const input = definition.input.parse(promptInput(args["input"]));
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: definition.render({ input }),
                },
              },
            ],
          };
        },
      };
      shell.registerPrompt(this.id, prompt);
    }
  }

  private runtimeResource(
    name: string,
    definition: ServiceResourceDefinition,
  ): Resource {
    return {
      uri: definition.uri,
      name,
      ...(definition.description
        ? { description: definition.description }
        : {}),
      mimeType: definition.mimeType ?? "text/plain",
      handler: async () => ({
        contents: [
          {
            uri: definition.uri,
            mimeType: definition.mimeType ?? "text/plain",
            text: await definition.read(),
          },
        ],
      }),
    };
  }

  private runtimeTool(definition: AnyServiceToolDefinition): Tool {
    const name = `${this.publicId}_${definition.name}`;
    const confirmations = createConfirmationGate({
      label: definition.name,
      requestNoun: "the operation",
    });
    return {
      name,
      description: definition.description,
      inputSchema: definition.input.shape,
      outputSchema: definition.output,
      visibility: definition.permission ?? "admin",
      sideEffects:
        definition.sideEffects ?? (definition.confirmation ? "writes" : "none"),
      handler: async (rawInput, toolContext): Promise<ToolResponse> => {
        try {
          const token = toolConfirmationToken(rawInput);
          if (token !== undefined) {
            const gateError = confirmations.validateConfirmed(token, rawInput);
            if (gateError) return gateError;
            const record = {
              ...z.record(z.string(), z.unknown()).parse(rawInput),
            };
            delete record[confirmationTokenField];
            rawInput = record;
          }
          const input = definition.input.parse(rawInput);
          if (token === undefined && definition.confirmation) {
            return {
              needsConfirmation: true,
              toolName: name,
              summary: definition.confirmation,
              args: confirmations.buildArgs((confirmationToken) => ({
                ...z.record(z.string(), z.unknown()).parse(input),
                [confirmationTokenField]: confirmationToken,
              })),
            };
          }

          const output = await this.toolContext.run(toolContext, () =>
            definition.execute({
              input,
              signal: toolContext.signal ?? new AbortController().signal,
            }),
          );
          return {
            success: true,
            data: definition.output.parse(output),
          };
        } catch (error) {
          return { success: false, error: getErrorMessage(error) };
        }
      },
    };
  }
}

export function createDeclarativeServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings
  >,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
  scope: (localId: string) => string,
): DeclarativeServicePlugin<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TViewSchemas,
  TAccountSettings
> {
  return new DeclarativeServicePlugin(definition, config, metadata, id, scope);
}
