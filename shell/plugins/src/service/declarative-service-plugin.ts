import { AsyncLocalStorage } from "node:async_hooks";
import { PUBLISH_CHANNELS, type JsonObject } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "../system-channels";
import type { JobHandler, JobInfo } from "@brains/job-queue";
import type { ProgressReporter } from "@brains/utils/progress";
import type { Prompt, Resource, Tool, ToolContext } from "@brains/mcp-service";
import {
  createTemplate,
  type ComponentType,
  type Template,
} from "@brains/templates";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import type { InboxItemDetail } from "../inbox-registry";
import { getErrorMessage } from "@brains/utils/error";
import type { z } from "@brains/utils/zod";
import type {
  PluginCapabilities,
  PluginRegistrationContext,
  IShell,
} from "../interfaces";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { createDeclarativeStudioWorkspaceRegistration } from "../operator/studio-workspace-runtime";
import { createDeclarativeDashboardWidgetRegistration } from "../operator/dashboard-widget-runtime";
import type {
  AnyStudioWorkspaceDefinition,
  AnyDashboardWidgetDefinition,
  BoundStudioWorkspace,
  BoundDashboardWidget,
} from "../operator/operator-definition-contract";
import {
  identityConfigSchema,
  type InstalledPluginPackageMetadata,
} from "../package-definition";
import { createEvalFixtures } from "../entity/eval-fixtures";
import {
  createDeclarativeDataSource,
  createDeclarativeEntityDataSource,
} from "../public/entity-data-source";
import { createReactionContext } from "./reaction-context";
import { createJobEntityAccess } from "../job/job-entity-access";
import {
  createRuntimeRoute,
  type RoutePermissions,
} from "../interface/route-runtime";
import type { WebRouteDefinition } from "../types/web-routes";
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
import { normalizeSameOriginPath } from "../internal/same-origin-path";
import { createRuntimeTool } from "./tool-runtime";
import { stateNamespaceFor } from "../internal/state-namespace";
import { permissionToVisibilityScope } from "@brains/entity-service";
import type { RuntimeStateScopeOptions } from "@brains/runtime-state";

function formatTemplateValue(
  template: ServiceTemplateDefinition<ServiceSchema>,
  value: unknown,
): string {
  return template.format({ value: template.schema.parse(value) });
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
  owned: ReadonlySet<string>,
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
          owned,
          serviceId,
        ),
        ai: context.ai,
        logger: context.logger,
        conversations: context.conversations,
        identity: context.identity,
        domain: context.domain,
        profileKinds: {
          getResolved: () => context.profileKinds.getResolved(),
          getSelectedDefinition: () =>
            context.profileKinds.getSelectedDefinition(),
        },
        template: templateName,
        uploads: context.uploads.scoped({
          // The runtime's own namespace, not the interface that happened to
          // receive the file: only the namespace decides which bytes a read
          // returns, and a job reads what it was handed.
          namespace: "upload",
          refKind: "upload",
          routePath: "/api/uploads",
        }),
        attachments: context.attachments,
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
  private readonly registeredStudioWorkspaceIds: string[] = [];
  private readonly registeredDashboardWidgetIds: string[] = [];
  private accountSettingsRegistration:
    AccountSettingsRegistration<NonNullable<TAccountSettings>> | undefined;
  /** Where Studio mounted each declared workspace, by its local id. */
  private readonly studioWorkspaceUrls = new Map<string, string>();
  private studioWorkspaceBindings: readonly BoundStudioWorkspace<
    AnyStudioWorkspaceDefinition,
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
    if (definition.dependsOn) {
      this.dependencies = [...definition.dependsOn];
    }
  }

  /** Plugin ids this service registers after; the runtime orders by these. */
  public readonly dependencies?: string[];

  /** Stewardship claims actually made, so shutdown releases exactly those. */
  private readonly stewardedTypes: string[] = [];

  /** Entity types this package may write: declared, plus stewarded. */
  private ownedTypeNames(): Set<string> {
    return new Set([
      ...(this.definition.entities ?? []).map(({ type }) => type),
      ...this.stewardedTypes,
    ]);
  }

  private routePermissions: RoutePermissions | undefined;

  public override getWebRoutes(): WebRouteDefinition[] {
    // Routes are a function of config alone, so composition tooling can
    // enumerate them from an uninstantiated definition. A protocol route's
    // permission lookup resolves at request time, when registration has
    // supplied it — an unregistered plugin can say what it serves, but not
    // yet serve it.
    const routeDefinitions =
      this.definition.routes?.({ config: this.config }) ?? [];
    return routeDefinitions.map((route) =>
      createRuntimeRoute(route, {
        declarationId: this.definition.id,
        permissions: {
          getUserLevel: (declarationId, userId) =>
            this.requireRoutePermissions().getUserLevel(declarationId, userId),
          isAnchor: (declarationId, userId) =>
            this.requireRoutePermissions().isAnchor(declarationId, userId),
        },
      }),
    );
  }

  private requireRoutePermissions(): RoutePermissions {
    if (!this.routePermissions) {
      throw new Error(
        `Service "${this.publicId}" cannot resolve a route caller before registration`,
      );
    }
    return this.routePermissions;
  }

  protected override async onReady(
    context: ServicePluginContext,
  ): Promise<void> {
    const seeds =
      this.definition.seeds?.({
        config: this.config,
        state: this.requireState(),
      }) ?? [];
    for (const seed of seeds) {
      // The existence check runs at full visibility: a seeded entity someone
      // made restricted still counts as existing, so a seed can never
      // overwrite or duplicate authored content.
      const existing = await context.entityService.getEntity({
        entityType: seed.entityType,
        id: seed.id,
        visibilityScope: "restricted",
      });
      if (existing) continue;
      await context.entityService.createEntityFromMarkdown({
        input: {
          entityType: seed.entityType,
          id: seed.id,
          markdown: await seed.markdown(),
        },
      });
    }

    for (const interaction of this.definition.interactions?.({
      config: this.config,
      state: this.requireState(),
      workspaceUrl: (workspaceId) => this.studioWorkspaceUrls.get(workspaceId),
    }) ?? []) {
      context.interactions.register({
        id: interaction.id,
        label: interaction.label,
        href: interaction.href,
        kind: interaction.kind,
        ...(interaction.description !== undefined
          ? { description: interaction.description }
          : {}),
        ...(interaction.priority !== undefined
          ? { priority: interaction.priority }
          : {}),
        ...(interaction.visibility !== undefined
          ? { visibility: interaction.visibility }
          : {}),
        ...(interaction.requiresActiveSession !== undefined
          ? { requiresActiveSession: interaction.requiresActiveSession }
          : {}),
      });
    }

    if (this.definition.ready) {
      await this.definition.ready({
        config: this.config,
        state: this.requireState(),
        entities: createJobEntityAccess(
          context.entityService,
          this.ownedTypeNames(),
          this.publicId,
        ),
        messaging: {
          send: (message) =>
            context.messaging.send({
              type: message.type,
              payload: message.payload,
            }),
        },
        logger: this.logger,
        dataDir: context.dataDir,
        jobs: this.jobs(),
        auth: this.requireShell().getAuthRegistry(),
        // Read-only shape questions; the registry's registering half stays
        // the runtime's.
        entityShapes: {
          frontmatterSchema: (entityType) =>
            context.entities.getEffectiveFrontmatterSchema(entityType),
          isSingleton: (entityType) =>
            context.entities.getAdapter(entityType)?.isSingleton === true,
          bodyTemplate: (entityType) =>
            context.entities.getAdapter(entityType)?.getBodyTemplate() ?? "",
        },
      });
    }
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
    // Claim before anything can write: a rejected claim must fail the
    // registration, not surface later as a permitted write.
    for (const entityType of this.definition.stewards ?? []) {
      context.entities.claimStewardship(entityType, this.publicId);
      this.stewardedTypes.push(entityType);
    }
    for (const kind of this.definition.profileKinds?.({
      config: this.config,
    }) ?? []) {
      context.profileKinds.register(kind);
    }
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
          // Reading only: a service finds the transport for a channel type,
          // it does not register descriptors or providers.
          channels: {
            getDeliveryProvider: (channelType) =>
              context.channels.getDeliveryProvider(channelType),
          },
          auth: context.auth,
          inbox: context.inbox,
          inboxFollowUps: context.inboxFollowUps,
          corpus: {
            search: async (request) => {
              const results = await context.entityService.search({
                query: request.query,
                options: {
                  ...(request.limit !== undefined
                    ? { limit: request.limit }
                    : {}),
                  ...(request.excludeTypes
                    ? { excludeTypes: [...request.excludeTypes] }
                    : {}),
                  // A package looking for evidence gets the whole corpus,
                  // because the question is about the brain rather than
                  // about who is asking — no caller is in scope here.
                  visibilityScope: permissionToVisibilityScope("admin"),
                },
              });
              return results.map((result) => ({
                entityType: result.entity.entityType,
                id: result.entity.id,
                excerpt: result.excerpt,
                content: result.entity.content,
                metadata: result.entity.metadata,
                score: result.score,
              }));
            },
          },
          judge: async (input) => ({
            verdict: (await context.judge(input)).verdict,
          }),
          // Stewarded types are read just above, so the owned set is already
          // complete by the time setup asks for it.
          entities: createJobEntityAccess(
            context.entityService,
            this.ownedTypeNames(),
            this.id,
          ),
          // Namespaced under the declaring package, exactly as the reaction
          // context does it, so what setup writes is what a handler reads.
          state: <TValue>(options: RuntimeStateScopeOptions<TValue>) =>
            context.runtimeState.scoped({
              ...options,
              namespace: stateNamespaceFor(this.packageName, options.namespace),
            }),
          logger: this.logger,
        })
      : (Object.freeze({}) as TState);

    this.routePermissions = context.permissions;

    const subscriptions =
      this.definition.subscriptions?.({
        config: this.config,
        state: this.state,
        jobs: this.jobs(),
      }) ?? [];
    const topics = new Set<string>();
    for (const subscription of subscriptions) {
      if (topics.has(subscription.topic)) {
        throw new Error(
          `Service "${this.definition.id}" subscribes to "${subscription.topic}" more than once`,
        );
      }
      topics.add(subscription.topic);
      context.messaging.subscribe(subscription.topic, async (message) => {
        const payload = subscription.payload.safeParse(message.payload);
        if (!payload.success) {
          return {
            success: false,
            error: `Service "${this.definition.id}" rejected a malformed "${subscription.topic}" request`,
          };
        }
        try {
          return {
            success: true,
            data: await subscription.handle({
              payload: payload.data,
              source: message.source,
              entities: context.entityService,
              identity: context.identity,
              messaging: {
                send: (message) =>
                  context.messaging.send({
                    type: message.type,
                    payload: message.payload,
                  }),
              },
            }),
          };
        } catch (error) {
          // A handler that cannot answer says so by throwing; the caller sees
          // a failed response rather than a successful one wrapping a refusal.
          return { success: false, error: getErrorMessage(error) };
        }
      });
    }

    const templates = this.templateFormatter();
    // Scoped like the entity-side slot, so two packages can each declare a
    // source called "entities" without colliding.
    for (const source of this.definition.dataSources?.({
      config: this.config,
      state: this.state,
    }) ?? []) {
      context.entities.registerDataSource(
        source.kind === "rizom-data-source"
          ? createDeclarativeDataSource(source, this.scope(source.id))
          : createDeclarativeEntityDataSource(
              source,
              this.scope(source.id),
              this.logger,
            ),
      );
    }

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
            this.ownedTypeNames(),
            this.publicId,
          ),
          visibilityScope,
        }),
      );
    }

    for (const check of this.definition.checks?.({
      config: this.config,
      state: this.state,
    }) ?? []) {
      this.cleanups.push(
        context.recurringChecks.register({
          // Bare: the registry scopes it by the plugin registering it, so
          // prefixing here names the plugin twice.
          id: check.id,
          cadence: check.cadence,
          ...(check.deliverAlerts !== undefined
            ? { deliverAlerts: check.deliverAlerts }
            : {}),
          ...(check.includeInInbox !== undefined
            ? { includeInInbox: check.includeInInbox }
            : {}),
          run: ({ signal }) =>
            check.run({
              ...this.reaction(),
              signal,
              workspaceUrl: (workspaceId) =>
                this.studioWorkspaceUrls.get(workspaceId),
            }),
        }),
      );
    }

    const inbox = this.definition.inbox?.({
      config: this.config,
      state: this.state,
    });
    if (inbox) {
      context.inbox.registerSource({
        sourceId: inbox.sourceId,
        displayName: inbox.displayName,
        ...(inbox.facets ? { facets: inbox.facets } : {}),
        list: () => inbox.list(this.reaction()),
        ...(inbox.resolveDetail
          ? {
              resolveDetail: (
                itemId,
                actor,
                signal,
              ): Promise<InboxItemDetail> =>
                inbox.resolveDetail?.(this.reaction(), itemId, actor, signal) ??
                Promise.reject(new Error("No detail")),
            }
          : {}),
        act: (itemId, actionId, actor) =>
          inbox.act(this.reaction(), itemId, actionId, actor),
      });
    }

    const ownedTypes = [...this.ownedTypeNames()];
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
          runProjectionRule: (rule, options) =>
            context.eval.runProjectionRule(rule, options),
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
          this.ownedTypeNames(),
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
    const ownedTypes = this.ownedTypeNames();
    for (const extension of this.definition.entityExtensions?.({
      config: this.config,
      state: this.requireState(),
      profileKinds: {
        getResolved: () => context.profileKinds.getResolved(),
        getSelectedDefinition: () =>
          context.profileKinds.getSelectedDefinition(),
      },
    }) ?? []) {
      if (!ownedTypes.has(extension.entityType)) {
        throw new Error(
          `Service "${this.publicId}" may only extend entity types it declares or stewards, and "${extension.entityType}" is neither`,
        );
      }
      if (extension.frontmatter) {
        context.entities.extendFrontmatterSchema(
          extension.entityType,
          extension.frontmatter,
        );
      }
      const validate = extension.validate;
      if (validate) {
        context.entities.registerPersistValidator(
          extension.entityType,
          async (entity) => {
            await validate(entity);
          },
        );
      }
    }
    if (context.executionOnly) return;
    this.bindOperatorDefinitions(context);

    const acquiredStudio: string[] = [];
    const acquiredDashboard: string[] = [];
    try {
      for (const binding of this.studioWorkspaceBindings) {
        const runtimeWorkspaceId = `${this.id}:${binding.definition.id}`;
        const registration = createDeclarativeStudioWorkspaceRegistration({
          publicServiceId: this.publicId,
          packageName: this.packageName,
          runtimeWorkspaceId,
          // Scoped like the workspace id itself: a declared alias names a
          // workspace this package used to publish, not a global route.
          ...(binding.definition.aliases
            ? {
                aliases: binding.definition.aliases.map((alias) => ({
                  id: `${this.id}:${alias.id}`,
                  query: alias.query,
                })),
              }
            : {}),
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
          const result = await context.studio.registerWorkspace(registration);
          if (result === false) {
            await this.rollbackStudioWorkspaces(context, acquiredStudio);
            acquiredStudio.splice(0);
            this.studioWorkspaceUrls.clear();
            break;
          }
          // Kept under the id the package wrote, not the scoped one: a link
          // this package declares names its own workspace, and where Studio
          // put it is the runtime's answer to give. A host that answers with
          // somewhere else is not answering about this brain, so nothing is
          // recorded and every link that would have used it is left unsaid.
          const workspaceUrl = normalizeSameOriginPath(result.workspaceUrl);
          if (workspaceUrl !== undefined) {
            this.studioWorkspaceUrls.set(binding.definition.id, workspaceUrl);
          }
        } catch (error) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" Studio workspace "${binding.definition.id}" host registration failed; correct the declaration or Studio configuration: ${getErrorMessage(error)}`,
            { cause: error },
          );
        }
        acquiredStudio.push(runtimeWorkspaceId);
      }
      this.registeredStudioWorkspaceIds.push(...acquiredStudio);

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
      await this.rollbackStudioWorkspaces(context, acquiredStudio);
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
    for (const entityType of this.stewardedTypes.splice(0)) {
      this.getContext().entities.releaseStewardship(entityType, this.publicId);
    }
    await this.rollbackDashboardWidgets(
      this.getContext(),
      this.registeredDashboardWidgetIds.splice(0),
    );
    await this.rollbackStudioWorkspaces(
      this.getContext(),
      this.registeredStudioWorkspaceIds.splice(0),
    );
    this.studioWorkspaceBindings = [];
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

    if (this.definition.studioWorkspaces && context.studio.isAvailable()) {
      const bindings = this.definition.studioWorkspaces({
        config: this.config,
        state: this.requireState(),
        accountSettings: this.definition.accountSettings,
      });
      const ids = new Set<string>();
      for (const binding of bindings) {
        const id = binding.definition.id;
        if (ids.has(id)) {
          throw new Error(
            `Service "${this.publicId}" package "${this.packageName}" registers Studio workspace "${id}" more than once; return each local workspace definition once`,
          );
        }
        ids.add(id);
      }
      this.studioWorkspaceBindings = Object.freeze([...bindings]);
    }
  }

  private async rollbackStudioWorkspaces(
    context: ServicePluginContext,
    workspaceIds: readonly string[],
  ): Promise<void> {
    for (const workspaceId of [...workspaceIds].reverse()) {
      try {
        await context.studio.unregisterWorkspace(workspaceId);
      } catch (error) {
        this.logger.error("Failed to unregister declarative Studio workspace", {
          serviceId: this.publicId,
          packageName: this.packageName,
          workspaceId,
          error: getErrorMessage(error),
        });
      }
      const index = this.registeredStudioWorkspaceIds.lastIndexOf(workspaceId);
      if (index >= 0) this.registeredStudioWorkspaceIds.splice(index, 1);
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

  /** The shell this service registered against. */
  private requireShell(): IShell {
    const shell = this.scopedShell;
    if (!shell) throw new Error(`Service "${this.publicId}" has no shell`);
    return shell;
  }

  private registerPrompts(): void {
    const shell = this.requireShell();
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

  /**
   * Entity access, a publisher, scoped notes, a permission check, a logger.
   * What a declaration is given when the runtime hands it something to do.
   */
  private reaction(): EntityReactionContext {
    return createReactionContext({
      context: this.getContext(),
      packageName: this.packageName,
      entities: createJobEntityAccess(
        this.getContext().entityService,
        this.ownedTypeNames(),
        this.publicId,
      ),
      logger: this.logger,
    });
  }

  private runtimeTool(definition: AnyServiceToolDefinition): Tool {
    return createRuntimeTool({
      definition,
      pluginId: this.publicId,
      reaction: () => this.reaction(),
      // A service attributes nested work to the caller for the duration of
      // the handler, so a job it enqueues carries who asked for it.
      run: (toolContext, operation) =>
        this.toolContext.run(toolContext, operation),
    });
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
