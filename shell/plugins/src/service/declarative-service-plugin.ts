import { AsyncLocalStorage } from "node:async_hooks";
import type { ContentFormatter } from "@brains/content-formatters";
import { PUBLISH_CHANNELS, type JsonObject } from "@brains/contracts";
import { SYSTEM_CHANNELS } from "../system-channels";
import type { JobHandler, JobInfo } from "@brains/job-queue";
import { createInboxReader } from "../base/namespaces";
import { createAttachmentReader } from "./attachment-registry";
import { createAuthReader } from "../contracts/auth-registry";
import type { ProgressReporter } from "@brains/utils/progress";
import type { Prompt, Resource, Tool, ToolContext } from "@brains/mcp-service";
import {
  createTemplate,
  type ComponentType,
  type Template,
  type TemplateDataSchema,
} from "@brains/templates";
import { registerDeclaredSubscriptions } from "../interface/declared-subscriptions";
import { createRequester } from "../internal/requester";
import type { EntityReactionContext } from "../entity/entity-definition-contract";
import type { InboxItemDetail } from "../inbox-registry";
import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
import { runCleanups } from "../internal/cleanup";
import { emptyPluginState } from "../base/empty-state";
import type {
  PluginCapabilities,
  PluginRegistrationContext,
  IShell,
} from "../interfaces";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { deriveConsoleSurfaces } from "../console-surfaces";
import type { UserPermissionLevel } from "@brains/templates";
import { createOperatorEntities } from "./operator-entities";
import { createEntityMirror } from "./entity-mirror";
import type { StaticSiteOutput } from "../contracts/http-host";
import {
  createServicePublishingAccess,
  PublishDelegationRegistry,
  type ServicePublishingAccess,
} from "./publish-delegation-registry";
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
import { createRoutedCreate } from "../entity/routed-create";
import type { RoutedCreate } from "../job/job-context-contract";
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
  InfrastructureAccess,
  NormalizedServiceDefinitionInput,
  ServiceInfrastructureContext,
  ServiceJobBinding,
  ServiceJobReference,
  ServiceJobStatus,
  ServiceActiveJob,
  ServiceEntityShapes,
  ServiceRecentJob,
  ServiceBatchReference,
  ServiceBatchStatus,
  ServiceJobs,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateFormatter,
} from "./service-definition-contract";
import {
  getServiceJobHandler,
  getServiceJobSettledHandler,
  parseServiceDeadline,
  prepareServiceJobInput,
} from "./service-definition-contract";
import {
  bindServiceJobRuntimeType,
  unbindServiceJobRuntimeType,
  getServiceJobRuntimeType,
  createServiceJobRequest,
  registerServiceJobResultReader,
} from "./job-definition-runtime";
import { normalizeSameOriginPath } from "../internal/same-origin-path";
import { createRuntimeTool } from "./tool-runtime";
import { stateNamespaceFor } from "../internal/state-namespace";
import { permissionToVisibilityScope } from "@brains/entity-service";
import type { RuntimeStateScopeOptions } from "@brains/runtime-state";

/** A template with its schema type erased and `format` bound to that schema. */
interface ErasedServiceTemplate {
  readonly schema: ServiceSchema;
  readonly namespace?: string | undefined;
  readonly permission?: UserPermissionLevel | undefined;
  readonly description?: string | undefined;
  format?(value: unknown): string;
  parse?(content: string): unknown;
  readonly component?: ComponentType<JsonObject> | undefined;
  readonly dataSourceId?: string | undefined;
  readonly overlayFormatter?: ContentFormatter<unknown> | undefined;
}

/**
 * A rendering template.s schema, as the registry needs it typed.
 *
 * The declaration proves the props: the runtime parses them through this very
 * schema before mounting the component, and a value that cannot survive the
 * trip fails there. What is lost is the static type alone, erased by walking
 * a map whose templates each carry a different schema.
 */
function renderableSchema(
  schema: ServiceSchema,
): TemplateDataSchema<JsonObject> {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- the erasure point described above; the runtime parse is the check
  return schema as TemplateDataSchema<JsonObject>;
}

/**
 * The infrastructure facts, for the declaration that asked for them.
 *
 * The field's type is a conditional on whether the package named the token,
 * and both arms are satisfied here: the facts are built when it did and
 * `undefined` when it did not. The compiler cannot resolve a conditional
 * over a type parameter it has not fixed, which is all this narrows.
 */
function infrastructureFor<
  TInfrastructure extends InfrastructureAccess | undefined,
>(
  asked: InfrastructureAccess | undefined,
  build: () => ServiceInfrastructureContext,
): TInfrastructure extends InfrastructureAccess
  ? ServiceInfrastructureContext
  : undefined {
  // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- see above: the arm built is the arm the declaration asked for
  return (
    asked ? build() : undefined
  ) as TInfrastructure extends InfrastructureAccess
    ? ServiceInfrastructureContext
    : undefined;
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
      ? parseWithSchema<TDefinition["output"]>(definition.output, job.result)
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
  const settled = getServiceJobSettledHandler(binding);
  const runtime: JobHandler<string, unknown, unknown> = {
    ...(definition.deadline
      ? { executionTimeoutMs: parseServiceDeadline(definition.deadline) }
      : {}),
    // The queue drives these once the terminal state is durable — after
    // retries — which is the only moment a child of a bulk mutation can be
    // accounted for.
    ...(settled
      ? {
          onTerminalSuccess: async (input, jobId): Promise<void> => {
            await settled({ input, jobId, outcome: "completed" });
          },
          onTerminalError: async (error, input, jobId): Promise<void> => {
            await settled({ input, jobId, outcome: "failed", error });
          },
        }
      : {}),
    validateAndParse(data): unknown | null {
      try {
        return prepareServiceJobInput(binding, data);
      } catch (error) {
        if (error instanceof z.ZodError) return null;
        throw error;
      }
    },
    async process(
      input: unknown,
      jobId: string,
      progress: ProgressReporter,
      signal: AbortSignal,
    ): Promise<unknown> {
      const output = await handler({
        input,
        jobId,
        signal,
        progress,
        templates,
        entities: createJobEntityAccess(
          context.entityService,
          owned,
          serviceId,
        ),
        createRouted: createRoutedCreate({
          requester: serviceId,
          interceptorFor: (entityType) =>
            context.entities.getCreateInterceptor(entityType),
          assertAllowed: (entityType, userPermissionLevel) =>
            context.permissions.assertEntityActionAllowed(
              entityType,
              "create",
              {
                userPermissionLevel,
              },
            ),
          // Who asked is on the job: the enqueue recorded the tool's caller.
          caller: async () => {
            const job = await context.jobs.getStatus(jobId);
            const actor = job?.metadata.requestedByActor;
            if (!job || !actor) return undefined;
            return {
              execution: {
                interfaceType:
                  job.metadata.interfaceType ??
                  job.metadata.requestedByInterface ??
                  "job",
                actor,
                ...(job.metadata.channelId
                  ? { channelId: job.metadata.channelId }
                  : {}),
              },
            };
          },
        }),
        ai: context.ai,
        prompts: context.prompts,
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
              broadcast: true,
            });
          },
        },
      });
      // Store the validated wire result, not a schema transform's output.
      // status() parses the stored value for its typed reader.
      const serialized = JSON.stringify(output);
      if (!serialized)
        throw new Error(
          `Job "${definition.name}" output must be JSON-serializable`,
        );
      const wireOutput: unknown = JSON.parse(serialized);
      definition.output.parse(wireOutput);
      return wireOutput;
    },
  };
  registerServiceJobResultReader(runtime, definition);
  return runtime;
}

/** What the queue files for one operation in a batch. */
const batchOperationData = z.record(z.string(), z.unknown());

class DeclarativeServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TInfrastructure extends InfrastructureAccess | undefined = undefined,
> extends ServicePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TInfrastructure
  >;
  private readonly publicId: string;
  private readonly toolContext = new AsyncLocalStorage<ToolContext>();
  private readonly cleanups: Array<() => void | Promise<void>> = [];
  private readonly registeredHooks: Array<() => void | Promise<void>> = [];
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
      TAccountSettings,
      TInfrastructure
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

  /**
   * Where this package's build writes, when it declared one.
   *
   * Config alone, so the host can ask before the plugin is installed — the
   * same reason `getWebRoutes` reads only config.
   */
  public getStaticSiteOutput(): StaticSiteOutput | undefined {
    return this.definition.staticSite?.({ config: this.config });
  }

  public override getWebRoutes(): WebRouteDefinition[] {
    // Built from what this instance set up, so a route answers with its own
    // plugin's state rather than whatever the definition happened to hold
    // last. Registration has run by the time anything asks: the production
    // collector iterates registered plugins.
    const routeDefinitions =
      this.definition.routes?.({
        config: this.config,
        state: this.requireState(),
        jobs: this.jobs(),
      }) ?? [];
    return routeDefinitions.map((route) =>
      createRuntimeRoute(route, {
        declarationId: this.definition.id,
        permissions: {
          getUserLevel: (declarationId, userId) =>
            this.requireRoutePermissions().getUserLevel(declarationId, userId),
          isAnchor: (declarationId, userId) =>
            this.requireRoutePermissions().isAnchor(declarationId, userId),
        },
        auth: () => this.getContext().auth,
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
          request: createRequester((message) =>
            context.messaging.send(message),
          ),
          publish: async (message): Promise<void> => {
            await context.messaging.send({
              type: message.topic,
              payload: message.data,
              broadcast: true,
            });
          },
        },
        logger: this.logger,
        dataDir: context.dataDir,
        jobs: this.jobs(),
        auth: createAuthReader(this.requireShell().getAuthRegistry()),
        entityShapes: entityShapesOf(context),
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
            onRegistered: (hook): void => {
              this.registeredHooks.push(hook);
            },
          },
          // Reading only: a service finds the transport for a channel type,
          // it does not register descriptors or providers.
          channels: {
            getDeliveryProvider: (channelType) =>
              context.channels.getDeliveryProvider(channelType),
            listDescriptors: () => context.channels.listDescriptors(),
          },
          auth: createAuthReader(context.auth),
          inbox: createInboxReader(context.inbox),
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
          identity: context.identity,
          profileKinds: context.profileKinds,
          publicSkills: context.publicSkills,
          plugins: context.plugins,
          http: context.http,
          siteUrl: context.siteUrl,
          domain: context.domain,
          previewUrl: context.previewUrl,
          localSiteUrl: context.localSiteUrl,
          preferLocalUrls: context.preferLocalUrls,
          views: context.views,
          templates: {
            resolve: context.templates.resolve,
            capabilities: (name) => context.templates.getCapabilities(name),
          },
          operatorEntities: createOperatorEntities(this.requireShell(), {
            interfaceType: this.definition.id,
          }),
          entityShapes: entityShapesOf(context),
          themeCSS: context.themeCSS,
          dataDir: context.dataDir,
          // Which process this is, where the broker lives, and a mirror of
          // every type: built for a package that declared itself
          // infrastructure, and `undefined` for every other, which is what
          // its setup context's type says it is.
          infrastructure: infrastructureFor<TInfrastructure>(
            this.definition.infrastructure,
            () => ({
              role: context.executionOnly ? "worker" : "scheduler",
              gitBroker: {
                socket: context.gitBrokerSocket,
                checkout: context.gitBrokerCheckout,
              },
              entityMirror: createEntityMirror(this.requireShell(), {
                pluginId: this.id,
              }),
            }),
          ),
          readiness: () => context.readiness(),
          entityDisplay: context.entityDisplay,
          surfaces: (options) =>
            deriveConsoleSurfaces(context.webRoutes.getRoutes(), {
              activeId: this.definition.id,
              ...(options.permissionLevel !== undefined
                ? { permissionLevel: options.permissionLevel }
                : {}),
              ...(options.hasActiveSession !== undefined
                ? { hasActiveSession: options.hasActiveSession }
                : {}),
              ...(options.selfHref !== undefined
                ? { self: { id: this.definition.id, href: options.selfHref } }
                : {}),
            }),
          messaging: {
            request: createRequester((message) =>
              context.messaging.send(message),
            ),
            publish: async (message): Promise<void> => {
              await context.messaging.send({
                type: message.topic,
                payload: message.data,
                broadcast: true,
              });
            },
          },
          permissions: context.permissions,
          attachments: createAttachmentReader(context.attachments),
          jobs: this.jobs(),
          publishing: this.publishingAccess(context),
          // Stewarded types are read just above, so the owned set is already
          // complete by the time setup asks for it.
          entities: createJobEntityAccess(
            context.entityService,
            this.ownedTypeNames(),
            this.id,
          ),
          // Namespaced under the declaring package, exactly as the reaction
          // context does it, so what setup writes is what a handler reads.
          runtimeState: <TValue>(options: RuntimeStateScopeOptions<TValue>) =>
            context.runtimeState.scoped({
              ...options,
              namespace: stateNamespaceFor(this.packageName, options.namespace),
            }),
          logger: this.logger,
        })
      : emptyPluginState<TState>();

    this.routePermissions = context.permissions;

    const subscriptions =
      this.definition.subscriptions?.({
        workspaceUrl: (workspaceId) =>
          this.studioWorkspaceUrls.get(workspaceId),
        config: this.config,
        state: this.state,
        jobs: this.jobs(),
      }) ?? [];
    registerDeclaredSubscriptions({
      label: `Service "${this.definition.id}"`,
      subscriptions,
      context,
    });

    const templates = this.templateFormatter(context);
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

    for (const [namespace, templates] of this.runtimeTemplatesByNamespace()) {
      context.templates.register(templates, namespace);
    }
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

    // A service declaring publish for a type delegates the same thing an
    // entity does: whoever publishes it records the outcome. The write is
    // scoped to that one type, whichever package the declaration came from.
    for (const declaration of declarations) {
      this.cleanups.push(
        PublishDelegationRegistry.getInstance().register({
          entityType: declaration.entityType,
          update: async (entity) =>
            createJobEntityAccess(
              context.entityService,
              new Set([declaration.entityType]),
              this.id,
            ).update(entity),
        }),
      );
    }

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
    // The package's jobs are bound by now; what setup deferred runs here, in
    // both roles, before the brain announces registration complete.
    for (const hook of this.registeredHooks.splice(0)) {
      await hook();
    }

    if (context.executionOnly) return;
    this.bindOperatorDefinitions(context);

    for (const [name, provider] of Object.entries(
      this.definition.health?.({
        config: this.config,
        state: this.requireState(),
      }) ?? {},
    )) {
      this.cleanups.push(context.operationalHealth.register(name, provider));
    }

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
        templates: this.templateFormatter(this.getContext()),
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
    await runCleanups(this.cleanups);
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

  /**
   * Writes another package delegated, and the asset jobs it named.
   *
   * The registry holds both, each recorded when its declaration registered;
   * this service supplies only who is asking, for the refusal message.
   */
  private publishingAccess(
    context: ServicePluginContext,
  ): ServicePublishingAccess {
    return createServicePublishingAccess({
      registry: PublishDelegationRegistry.getInstance(),
      serviceLabel: this.id,
      enqueue: ({ type, data, deduplicationKey }) =>
        context.jobs.enqueue({
          type,
          data,
          options: {
            source: this.id,
            metadata: { operationType: "content_operations" },
            deduplication: "skip",
            deduplicationKey,
          },
        }),
    });
  }

  private jobs(): ServiceJobs {
    const context = this.getContext();
    const batchStatus = async (
      id: string,
    ): Promise<ServiceBatchStatus | null> => {
      const batch = await context.jobs.getBatchStatus(id);
      if (!batch) return null;
      return {
        id: batch.batchId,
        status: batch.status,
        total: batch.totalOperations,
        completed: batch.completedOperations,
        failed: batch.failedOperations,
        errors: batch.errors,
        ...(batch.currentOperation !== undefined
          ? { currentOperation: batch.currentOperation }
          : {}),
      };
    };
    return {
      active: async (): Promise<readonly ServiceActiveJob[]> =>
        (await context.jobs.getActiveJobs())
          .filter(
            (job) =>
              job.source === this.id &&
              (job.status === "pending" || job.status === "processing"),
          )
          .map((job) => ({
            id: job.id,
            type: this.declaredJobType(job.type),
            status: job.status === "processing" ? "processing" : "pending",
            data: parseJobData(job.data),
          })),
      find: async (jobId): Promise<ServiceRecentJob | null> => {
        const job = await context.jobs.getStatus(jobId);
        return job?.source === this.id
          ? toRecentJob(job, (type) => this.declaredJobType(type))
          : null;
      },
      recent: async (options): Promise<readonly ServiceRecentJob[]> =>
        (
          await context.jobs.getRecentJobs(
            options?.types?.map((type) => this.scopedJobType(type)),
            options?.limit,
          )
        )
          .filter((job) => job.source === this.id)
          .map((job) => toRecentJob(job, (type) => this.declaredJobType(type))),
      enqueue: async <TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        input: z.input<TDefinition["input"]>,
      ): Promise<ServiceJobReference<TDefinition>> => {
        if (!this.registeredJobs.has(definition)) {
          throw new Error(
            `Service "${this.publicId}" cannot enqueue unregistered job "${definition.name}"`,
          );
        }
        const toolContext = this.toolContext.getStore();
        const id = await context.jobs.enqueue({
          ...createServiceJobRequest(definition, input, this.id),
          ...(toolContext ? { toolContext } : {}),
        });
        return Object.freeze({
          id,
          status: async () => {
            const job = await context.jobs.getStatus(id);
            return job?.type === getServiceJobRuntimeType(definition)
              ? statusFor(definition, job)
              : null;
          },
        });
      },
      async status<TDefinition extends AnyServiceJobDefinition>(
        definition: TDefinition,
        id: string,
      ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null> {
        const job = await context.jobs.getStatus(id);
        return job?.type === getServiceJobRuntimeType(definition)
          ? statusFor(definition, job)
          : null;
      },
      enqueueBatch: async (
        operations,
        options,
      ): Promise<ServiceBatchReference> => {
        for (const operation of operations) {
          if (!this.registeredJobs.has(operation.definition)) {
            throw new Error(
              `Service "${this.publicId}" cannot enqueue unregistered job "${operation.definition.name}"`,
            );
          }
        }
        const id = await context.jobs.enqueueBatch(
          operations.map((operation) => {
            // A batch must own each child's completion/progress. Sharing a
            // pending job with another root cannot honor that ownership.
            if (operation.definition.oncePending) {
              throw new Error(
                `Job "${operation.definition.name}" uses oncePending and cannot be enqueued as a batch child`,
              );
            }
            const request = createServiceJobRequest(
              operation.definition,
              operation.input,
              this.id,
            );
            return {
              type: request.type,
              data: batchOperationData.parse(request.data),
              ...(request.options?.maxRetries !== undefined
                ? { maxRetries: request.options.maxRetries }
                : {}),
            };
          }),
          {
            source: this.id,
            ...(options?.priority !== undefined
              ? { priority: options.priority }
              : {}),
            ...(options?.rootJobId !== undefined
              ? { rootJobId: options.rootJobId }
              : {}),
            metadata: {
              operationType: "batch_processing",
              pluginId: this.id,
              ...(options?.progressToken !== undefined
                ? { progressToken: options.progressToken }
                : {}),
              ...(options?.operationTarget !== undefined
                ? { operationTarget: options.operationTarget }
                : {}),
            },
          },
        );
        return Object.freeze({
          id,
          status: (): Promise<ServiceBatchStatus | null> => batchStatus(id),
        });
      },
      batchStatus,
    };
  }

  private templateFormatter(
    context: ServicePluginContext,
  ): ServiceTemplateFormatter {
    const formatters = this.erasedTemplates();
    return {
      format(name, value): string {
        const template = formatters.get(name);
        // A package's own template formats through the declaration it was
        // written as; a template the brain composed formats through the
        // registry that holds it.
        // A template that only renders has no text to give, so the registry
        // answers for it.
        if (template?.format) return template.format(value);
        return context.templates.format(name, value);
      },
      capabilities: (name) => context.templates.getCapabilities(name),
      generate: async (name, generationContext) =>
        context.templates.generate(name, generationContext),
    };
  }

  /**
   * Erase each template's schema type where it is still known, binding format
   * to the schema it belongs to. Reading the definition's mapped type as a
   * plain record is not assignable — ServiceTemplateDefinition is
   * contravariant in its schema through `format` — so the erasure happens here
   * rather than being asserted away at the read site.
   */
  private erasedTemplates(): Map<string, ErasedServiceTemplate> {
    const declared = this.definition.templates;
    const templates =
      typeof declared === "function"
        ? declared({ config: this.config })
        : (declared ?? {});
    return new Map(
      Object.entries(templates).map(([name, template]) => {
        const { format, render } = template;
        if (!format && !render) {
          throw new Error(
            `Service "${this.publicId}" template "${name}" neither formats nor renders`,
          );
        }
        return [
          name,
          {
            schema: template.schema,
            namespace: template.namespace,
            permission: template.permission,
            description: template.description,
            dataSourceId: template.dataSourceId,
            overlayFormatter: template.overlayFormatter,
            ...(format
              ? {
                  format: (value: unknown): string =>
                    format({ value: template.schema.parse(value) }),
                }
              : {}),
            ...(template.parse
              ? {
                  parse: (content: string): unknown =>
                    template.parse?.(content),
                }
              : {}),
            ...(render
              ? {
                  component: (props: JsonObject) =>
                    render(template.schema.parse(props)),
                }
              : {}),
          },
        ];
      }),
    );
  }

  /**
   * The name the queue files one of this package's jobs under.
   *
   * The runtime scopes a service's job types by its id, so a package asking
   * about its own work has to ask under the scoped name — and read the plain
   * one back.
   */
  private scopedJobType(name: string): string {
    return name.includes(":") ? name : `${this.id}:${name}`;
  }

  /** The name this package declared, given the name the queue filed. */
  private declaredJobType(type: string): string {
    const prefix = `${this.id}:`;
    return type.startsWith(prefix) ? type.slice(prefix.length) : type;
  }

  /**
   * Every template this package registers, grouped by where it is named
   * from. Most sit under the package; a configured page section sits under
   * the namespace its author chose.
   */
  private runtimeTemplatesByNamespace(): Map<string, Record<string, Template>> {
    const templates = this.erasedTemplates();
    const grouped = new Map<string, Record<string, Template>>();
    for (const [name, template] of Object.entries(this.runtimeTemplates())) {
      const namespace = templates.get(name)?.namespace ?? this.id;
      const existing = grouped.get(namespace) ?? {};
      existing[name] = template;
      grouped.set(namespace, existing);
    }
    return grouped;
  }

  private runtimeTemplates(): Record<string, Template> {
    const result: Record<string, Template> = {};

    for (const [name, template] of this.erasedTemplates()) {
      const { format, parse, component } = template;
      const base = {
        name,
        description: template.description ?? `${this.publicId} ${name}`,
        schema: template.schema,
        requiredPermission: template.permission ?? ("admin" as const),
        ...(template.dataSourceId
          ? { dataSourceId: template.dataSourceId }
          : {}),
        ...(template.overlayFormatter
          ? { overlayFormatter: template.overlayFormatter }
          : {}),
        ...(format
          ? {
              formatter: {
                format: (value: unknown): string => format(value),
                // A template that only formats is a one-way street; saying so
                // where it is read beats returning something made up.
                parse: parse
                  ? (content: string): unknown => parse(content)
                  : (): never => {
                      throw new Error(`Template "${name}" is format-only`);
                    },
              },
            }
          : {}),
      };
      result[name] = component
        ? createTemplate<JsonObject>({
            ...base,
            schema: renderableSchema(template.schema),
            layout: { component },
          })
        : createTemplate(base);
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
    for (const [name, definition] of Object.entries(
      this.definition.prompts ?? {},
    )) {
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

  /** A create through another type's route, done as this caller. */
  private routedCreate(caller: ToolContext): RoutedCreate {
    const context = this.getContext();
    return createRoutedCreate({
      requester: this.publicId,
      interceptorFor: (entityType) =>
        context.entities.getCreateInterceptor(entityType),
      assertAllowed: (entityType, userPermissionLevel) =>
        context.permissions.assertEntityActionAllowed(entityType, "create", {
          userPermissionLevel,
        }),
      caller: () => ({
        execution: {
          interfaceType: caller.interfaceType,
          actor: caller.actor,
          ...(caller.channelId ? { channelId: caller.channelId } : {}),
          ...(caller.channelName ? { channelName: caller.channelName } : {}),
        },
        permissionLevel: caller.userPermissionLevel,
      }),
    });
  }

  private runtimeTool(definition: AnyServiceToolDefinition): Tool {
    return createRuntimeTool({
      definition,
      pluginId: this.publicId,
      reaction: () => this.reaction(),
      routedCreate: (caller) => this.routedCreate(caller),
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
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TInfrastructure extends InfrastructureAccess | undefined = undefined,
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TInfrastructure
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
  TAccountSettings,
  TInfrastructure
> {
  return new DeclarativeServicePlugin(definition, config, metadata, id, scope);
}

/**
 * A queued job's payload, as the queue stored it.
 *
 * The queue keeps data as JSON text; a declaration reads a value. An
 * unreadable payload reads as undefined rather than throwing, because the
 * caller is listing work in flight, not executing it.
 */
function parseJobData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return undefined;
  }
}

/**
 * Read-only shape questions about entity types; the registry's registering
 * half stays the runtime's.
 */
function entityShapesOf(context: ServicePluginContext): ServiceEntityShapes {
  return {
    frontmatterSchema: (entityType) =>
      context.entities.getEffectiveFrontmatterSchema(entityType),
    isSingleton: (entityType) =>
      context.entities.getAdapter(entityType)?.isSingleton === true,
    bodyTemplate: (entityType) =>
      context.entities.getAdapter(entityType)?.getBodyTemplate() ?? "",
    // Absent means a body, which is what most types have.
    hasBody: (entityType) =>
      context.entities.getAdapter(entityType)?.hasBody !== false,
    parse: (entityType, markdown) =>
      context.entities.getAdapter(entityType)?.fromMarkdown(markdown),
  };
}

/** One queued job, as a declaration reads it. */
function toRecentJob(
  job: {
    id: string;
    type: string;
    status: "pending" | "processing" | "completed" | "failed";
    createdAt: number;
    startedAt: number | null;
    completedAt: number | null;
    data: string;
    result?: unknown;
    lastError: string | null;
  },
  declaredType: (type: string) => string,
): ServiceRecentJob {
  return {
    id: job.id,
    // A package names its own work by the name it declared, not the scoped
    // one the queue files it under.
    type: declaredType(job.type),
    status: job.status,
    createdAt: job.createdAt,
    data: parseJobData(job.data),
    result: job.result,
    ...(job.startedAt !== null ? { startedAt: job.startedAt } : {}),
    ...(job.completedAt !== null ? { completedAt: job.completedAt } : {}),
    ...(job.lastError !== null ? { error: job.lastError } : {}),
  };
}
