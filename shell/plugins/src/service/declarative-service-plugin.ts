import { AsyncLocalStorage } from "node:async_hooks";
import { unscopeTemplateName } from "@brains/content-service";
import {
  SDK_ERROR_MESSAGE_MAX_LENGTH,
  SdkError,
  jsonObjectSchema,
  toSdkError,
  type ActorRef,
  type BusContract,
  type JsonObject,
  type SdkErrorCode,
} from "@brains/contracts";
import type { Caller, CallerAccess } from "@brains/content-service";
import { formatZodIssues } from "@brains/utils/zod-issues";
import { createServiceContentTarget } from "./content-generation-target";
import type { JobHandler } from "@brains/job-queue";
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
import {
  CONSENT_STATE_LIFETIME,
  SingleUseStore,
} from "@brains/utils/single-use-store";
import { z } from "@brains/utils/zod";
import { emptyPluginState } from "../base/empty-state";
import type {
  PluginCapabilities,
  PluginRegistrationContext,
  IShell,
} from "../interfaces";
import {
  sealAccountSettings,
  type AnyAccountSettingsDefinition,
  type SealedAccountSettingsValue,
} from "../operator/account-settings-definition-contract";
import type { AccountSettingsRegistration } from "../operator/account-settings-registry";
import { createDeclarativeStudioWorkspaceRegistration } from "../operator/studio-workspace-runtime";
import { createDeclarativeDashboardWidgetRegistration } from "../operator/dashboard-widget-runtime";
import type {
  OperatorCallScope,
  OperatorRunAs,
} from "../operator/operator-context-runtime";
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
import type { AnyEntityDefinition } from "../entity/entity-definition-contract";
import {
  assertOwnedWriteAllowed,
  createOwnedEntityWriter,
} from "../entity/owned-entity-writer-runtime";
import { packageRuntimeState } from "../internal/state-namespace";
import {
  withServiceRuntime,
  type ServiceEntityShapes,
} from "./service-runtime";
import { ServicePlugin } from "./service-plugin";
import type { ServicePluginContext } from "./context";
import type {
  AnyServiceJobDefinition,
  AnyServiceToolDefinition,
  NormalizedServiceDefinitionInput,
  ServiceContentGeneration,
  ServiceContentGenerationResult,
  ServiceEntityAccess,
  ServiceAccountSettings,
  ServiceAnswer,
  ServiceJobBinding,
  ServiceJobReference,
  ServiceJobStatus,
  ServiceJobs,
  ServiceMessaging,
  ServiceResourceDefinition,
  ServiceSchema,
  ServiceSchemaMap,
  ServiceTemplateFormatter,
  ServiceTemplateGenerationDefinition,
  ServiceTemplateShapeMap,
  ServiceSubscriptionBinding,
} from "./service-definition-contract";
import {
  getServiceJobHandler,
  parseServiceDeadline,
} from "./service-definition-contract";
import {
  bindServiceJobRuntimeType,
  unbindServiceJobRuntimeType,
} from "./job-definition-runtime";
import { serviceJobStatus } from "./job-status";
import {
  admitPackageJob,
  anonymousCaller,
  createPackageEntityReader,
  packageReadScope,
  packageSelfCall,
  queuedJobCall,
  serviceJobDataSchema,
  toolCaller,
  type PackageCall,
  type ServiceJobData,
} from "./job-authority";
import {
  isReturnToRoute,
  type AnyDeclaredRouteDefinition,
  type ReturnToWorkspace,
} from "../interface/route-definition-contract";
import { createDeclaredRoute } from "../internal/declared-route";
import type { WebRouteDefinition } from "../types/web-routes";

const confirmationTokenField = "_rizomConfirmationToken";

/**
 * Who a slot's `entities` acts as right now: the access it reads and writes
 * at, and whom a write is attributed to.
 */
interface ServiceCall extends PackageCall {
  /** Who a job started now is admitted as; unset, the package itself. */
  readonly caller?: Caller | undefined;
  /** The account the caller signed in as, when it has one. */
  account?(): Promise<AccountHolder | undefined>;
  readonly eventContext: {
    readonly actor: ActorRef;
    readonly interfaceType?: string;
  };
}

/** An account the runtime vouches for, and the browser session it came through. */
interface AccountHolder {
  readonly userId: string;
  /** Set when the caller came through a browser session of this account. */
  readonly sessionUserId?: string | undefined;
}

/** What a claim names: the account, and the session it was made in. */
type AccountClaim = AccountHolder;

const schemaRefusalShape = z.object({
  issues: z.array(
    z.object({ path: z.array(z.union([z.string(), z.number()])) }),
  ),
});

/** A schema's refusal of account settings, named by its fields alone. */
function refusedSettingsFields(error: unknown): string[] | undefined {
  if (!(error instanceof Error) || error.name !== "ZodError") return undefined;
  const parsed = schemaRefusalShape.safeParse(error);
  if (!parsed.success) return undefined;
  return [
    ...new Set(
      parsed.data.issues.map((issue) => issue.path.join(".") || "(root)"),
    ),
  ];
}

/**
 * A template with its schema type erased: `format` and the component bound
 * to that schema, so a value is parsed before either runs.
 */
interface ErasedServiceTemplate {
  readonly schema: ServiceSchema;
  readonly description?: string | undefined;
  readonly generation?: ServiceTemplateGenerationDefinition | undefined;
  readonly format?: ((value: unknown) => string) | undefined;
  readonly component?: ComponentType<JsonObject> | undefined;
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

function runtimeJobHandler(
  binding: ServiceJobBinding,
  context: ServicePluginContext,
  withCall: <T>(call: ServiceCall, run: () => Promise<T>) => Promise<T>,
): JobHandler<string, ServiceJobData, unknown> {
  const definition = binding.definition;
  const handler = getServiceJobHandler(binding);
  // Queued data names who started the job; data without it is invalid.
  const dataSchema = serviceJobDataSchema(definition.input);
  return {
    ...(definition.deadline
      ? { executionTimeoutMs: parseServiceDeadline(definition.deadline) }
      : {}),
    validateAndParse(data): ServiceJobData | null {
      const parsed = dataSchema.safeParse(data);
      return parsed.success ? parsed.data : null;
    },
    async process(
      job: ServiceJobData,
      _jobId: string,
      progress: ProgressReporter,
      signal: AbortSignal,
    ): Promise<unknown> {
      // The job reads and writes with its requester's current access, never
      // more than it was admitted at; a revoked requester's job is refused here.
      // A job the package queued for itself runs as the package.
      const call: ServiceCall = await queuedJobCall(context.jobAuthority, job);
      const { input } = job;
      const output = await withCall(call, () =>
        handler({ input, signal, progress }),
      );
      const parsed = definition.output.safeParse(output);
      if (!parsed.success) {
        throw new SdkError("invalid_response", {
          message: `Job "${definition.name}" answered outside its output schema`,
          cause: parsed.error,
        });
      }
      // Stored as the handler answered; a status read parses it, once.
      return output;
    },
  };
}

class DeclarativeServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
> extends ServicePlugin<z.output<TConfigSchema>, z.output<TConfigSchema>> {
  private readonly definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities
  >;
  /** The caller a slot's `entities` acts as inside a tool or a running job. */
  private readonly calls = new AsyncLocalStorage<ServiceCall>();
  private entityAccessCache: ServiceEntityAccess<TEntities[number]> | undefined;
  private readonly publicId: string;
  /** Registered before this plugin; a first-party class's, named by the composer. */
  public readonly dependencies: string[];
  private readonly toolContext = new AsyncLocalStorage<ToolContext>();
  private readonly cleanups: Array<() => void | Promise<void>> = [];
  private readonly registeredJobs = new Set<AnyServiceJobDefinition>();
  /** Releases the contracts this package answers. */
  private readonly answered: Array<() => void> = [];
  /** What a first-party package runs once the brain is ready. */
  private readonly readyHandlers: Array<() => Promise<void>> = [];
  /** What a first-party package runs once every plugin has registered. */
  private readonly registeredHandlers: Array<() => Promise<void>> = [];
  private routes: WebRouteDefinition[] = [];
  private readonly operatorAbortController = new AbortController();
  private readonly registeredStudioWorkspaceIds: string[] = [];
  /** Where Studio serves each workspace this package registered. */
  private readonly workspaceUrls = new Map<ReturnToWorkspace, string>();
  /** The routes that return the browser to one of this package's workspaces. */
  private readonly returnTargets: {
    readonly route: AnyDeclaredRouteDefinition;
    readonly workspace: ReturnToWorkspace;
  }[] = [];
  private readonly registeredDashboardWidgetIds: string[] = [];
  private accountSettingsRegistration:
    AccountSettingsRegistration<NonNullable<TAccountSettings>> | undefined;
  private studioWorkspaceBindings: readonly BoundStudioWorkspace<
    AnyStudioWorkspaceDefinition,
    z.output<TConfigSchema>,
    TState,
    TAccountSettings,
    TEntities[number]
  >[] = [];
  private dashboardWidgetBindings: readonly BoundDashboardWidget<
    AnyDashboardWidgetDefinition,
    z.output<TConfigSchema>,
    TState,
    TAccountSettings
  >[] = [];
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
      TTemplateDefinitions,
      TEntities
    >,
    config: z.output<TConfigSchema>,
    metadata: InstalledPluginPackageMetadata,
    id: string,
    dependencies: readonly string[],
  ) {
    super(id, metadata, config, identityConfigSchema());
    this.definition = definition;
    this.publicId = definition.id;
    this.dependencies = [...dependencies];
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
          runtimeState: packageRuntimeState(
            context.runtimeState,
            this.packageName,
          ),
        })
      : emptyPluginState<TState>();

    const templates = this.templateFormatter();
    context.templates.register(this.runtimeTemplates(), this.id);
    this.registerPrompts();

    const bindings =
      this.definition.jobs?.({
        config: this.config,
        state: this.state,
        entities: this.entityAccess(),
        messaging: this.messaging(),
        templates,
      }) ?? [];
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
        runtimeJobHandler(binding, context, (call, run) =>
          this.calls.run(call, run),
        ),
      );
    }
    this.registerSubscriptions(context);
    this.routes = (
      this.definition.routes?.({
        config: this.config,
        state: this.state,
        entities: this.entityAccess(),
        jobs: this.jobs(),
        messaging: this.messaging(),
        accountSettings: this.accountSettingsWriter(),
      }) ?? []
    ).map((route) => this.runtimeRoute(route));
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [...this.routes];
  }

  /** A declared route, served as its caller. */
  private runtimeRoute(route: AnyDeclaredRouteDefinition): WebRouteDefinition {
    if (isReturnToRoute(route)) {
      this.returnTargets.push({ route, workspace: route.returnTo });
    }
    const permissions = this.requireShell().getPermissionService();
    return createDeclaredRoute(route, {
      declarationId: this.publicId,
      permissions: {
        getUserLevel: (declarationId, actorId) =>
          permissions.determineUserLevel(declarationId, actorId),
        isAnchor: (declarationId, actorId) =>
          permissions.isAnchor(declarationId, actorId),
      },
      anonymous: anonymousCaller(this.id),
      runAs: (caller, request, run) =>
        this.calls.run(this.routeCall(caller, request), run),
      logger: this.logger,
      workspaceUrl: (workspace) => this.workspaceUrls.get(workspace),
    });
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
    // In every process, as the class's onRegistrationComplete ran.
    for (const handler of this.registeredHandlers) await handler();
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
          entities: this.entityAccess(),
          accountSettings: this.accountSettingsWriter(),
          runAs: this.asOperator,
        });
        try {
          const result = await context.studio.registerWorkspace(registration);
          if (result === false) {
            await this.rollbackStudioWorkspaces(context, acquiredStudio);
            acquiredStudio.splice(0);
            this.workspaceUrls.clear();
            break;
          }
          this.workspaceUrls.set(binding.definition, result.workspaceUrl);
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
          entities: this.entityAccess(),
          accountSettings: this.accountSettingsWriter(),
          runAs: this.asOperator,
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
        entities: this.entityAccess(),
        jobs: this.jobs(),
        messaging: this.messaging(),
        accountSettings: this.accountSettingsWriter(),
        templates: this.templateFormatter(),
        content: this.content(),
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

  protected override async onReady(): Promise<void> {
    for (const handler of this.readyHandlers) await handler();
  }

  protected override async onShutdown(): Promise<void> {
    this.operatorAbortController.abort(
      new Error(`Service "${this.publicId}" is shutting down`),
    );
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
    this.workspaceUrls.clear();
    this.returnTargets.splice(0);
    this.tools = undefined;
    this.resources = undefined;
    this.routes = [];
    for (const job of this.registeredJobs) {
      unbindServiceJobRuntimeType(job, `${this.id}:${job.name}`);
    }
    this.registeredJobs.clear();
    for (const release of this.answered.splice(0).reverse()) release();
    this.readyHandlers.splice(0);
    this.registeredHandlers.splice(0);
    for (const cleanup of this.cleanups.splice(0).reverse()) {
      await cleanup();
    }
  }

  /**
   * A route may return the browser only to a workspace this package binds;
   * any other, another package's included, is refused here.
   */
  private assertReturnTargets(): void {
    const bound = new Set<ReturnToWorkspace>(
      this.studioWorkspaceBindings.map((binding) => binding.definition),
    );
    for (const { route, workspace } of this.returnTargets) {
      if (!bound.has(workspace)) {
        throw new Error(
          `Service "${this.publicId}" route ${route.method} ${route.path} returns to Studio workspace "${workspace.id}", which this package does not declare`,
        );
      }
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
      this.assertReturnTargets();
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

  /** A tool call acts as its caller; access is admitted once, when first used. */
  private toolCall(toolContext: ToolContext): ServiceCall {
    const context = this.getContext();
    let admitted: Promise<CallerAccess> | undefined;
    const caller = toolCaller(toolContext);
    const { actor } = toolContext;
    return {
      access: () => (admitted ??= context.jobAuthority.access(caller)),
      caller,
      // A tool call carries no browser session, so its account is unbound.
      account: async () =>
        actor.kind === "user" ? { userId: actor.userId } : undefined,
      eventContext: {
        actor: toolContext.actor,
        interfaceType: toolContext.interfaceType,
      },
    };
  }

  /**
   * An operator callback runs as the operator who called it, so every
   * capability the package holds, its slots' `entities` included, acts as
   * them; a Dashboard viewer nobody signed in is held to public.
   */
  private readonly asOperator: OperatorRunAs = (scope, run) =>
    this.calls.run(this.operatorCall(scope), run);

  /** An operator's call; access is admitted once, when first used. */
  private operatorCall(scope: OperatorCallScope): ServiceCall {
    const context = this.getContext();
    const caller: Caller = scope.caller
      ? {
          actor: scope.actor ?? { kind: "user", userId: scope.caller.actor.id },
          permissionLevel: scope.caller.permission,
        }
      : anonymousCaller(this.id);
    let admitted: Promise<CallerAccess> | undefined;
    const userId = scope.caller?.actor.id;
    return {
      access: () => (admitted ??= context.jobAuthority.access(caller)),
      caller,
      // A Studio operator acts through a browser session of their own
      // account, so a claim they make binds that session; a Dashboard
      // viewer's account is theirs to read, with no session bound.
      account: async () =>
        userId === undefined
          ? undefined
          : scope.browserSession
            ? { userId, sessionUserId: userId }
            : { userId },
      eventContext: { actor: caller.actor, interfaceType: scope.interfaceType },
    };
  }

  /** A route call acts as its caller; access is admitted once, when first used. */
  private routeCall(caller: Caller, request: Request): ServiceCall {
    const context = this.getContext();
    let admitted: Promise<CallerAccess> | undefined;
    let session: Promise<AccountHolder | undefined> | undefined;
    return {
      access: () => (admitted ??= context.jobAuthority.access(caller)),
      caller,
      // The browser session the request came with, resolved by the runtime;
      // the package never sees sessions.
      account: () =>
        (session ??= (async (): Promise<AccountHolder | undefined> => {
          const principal = await context.auth.get()?.resolveSession(request);
          return principal
            ? { userId: principal.userId, sessionUserId: principal.userId }
            : undefined;
        })()),
      eventContext: { actor: caller.actor },
    };
  }

  /** Single-use claims on this package's account settings. */
  private readonly accountClaims = new SingleUseStore<AccountClaim>(
    CONSENT_STATE_LIFETIME,
  );

  /**
   * This package's own account settings, written for an account the runtime
   * vouches for: the current caller's, or the one a claim names.
   */
  private accountSettingsWriter(): ServiceAccountSettings<
    NonNullable<TAccountSettings>
  > {
    const holder = async (): Promise<AccountHolder> => {
      const account = await this.calls.getStore()?.account?.();
      if (!account) {
        throw new SdkError("permission_denied", {
          publicMessage: "Account settings need a signed-in account",
        });
      }
      return account;
    };
    const write = async (userId: string, values: unknown): Promise<void> => {
      const registration = this.accountSettingsRegistration;
      if (!registration) {
        throw new SdkError("permission_denied", {
          message: `Service "${this.publicId}" keeps no account settings here`,
        });
      }
      const input = z.record(z.string(), z.unknown()).safeParse(values);
      if (!input.success) {
        throw new SdkError("invalid_input", {
          publicMessage: "Account settings must be an object",
        });
      }
      try {
        await this.getContext().accountSettings.save(
          registration.id,
          userId,
          input.data,
        );
      } catch (error) {
        // A refused value is named by its field; the value itself, which may
        // be a secret, reaches neither the caller nor the log.
        const fields = refusedSettingsFields(error);
        if (!fields) throw error;
        const refusal = `Invalid account settings: ${fields.join(", ")}`;
        throw new SdkError("invalid_input", {
          message: refusal,
          publicMessage: refusal,
        });
      }
    };
    return {
      read: async (): Promise<SealedAccountSettingsValue<
        NonNullable<TAccountSettings>
      > | null> => {
        const account = await this.calls.getStore()?.account?.();
        const registration = this.accountSettingsRegistration;
        if (!account || !registration) return null;
        // The caller's own account only; the package never names one.
        const values = await this.getContext().accountSettings.getForActor(
          registration,
          account.userId,
        );
        return values
          ? sealAccountSettings(registration.definition, values)
          : null;
      },
      save: async (values) => write((await holder()).userId, values),
      claim: async (): Promise<string> => {
        const account = await holder();
        return this.accountClaims.issue(account);
      },
      redeem: async (state, produce): Promise<void> => {
        const redeemer = await this.calls.getStore()?.account?.();
        // A claim made in a browser session is taken only by the same
        // account's session; a refused one stays for its own.
        const claim = this.accountClaims.take(
          state,
          (pending) =>
            pending.sessionUserId === undefined ||
            pending.sessionUserId === redeemer?.sessionUserId,
        );
        if (!claim) {
          throw new SdkError("permission_denied", {
            publicMessage: "This link has expired or was already used",
          });
        }
        await write(claim.userId, await produce());
      },
    };
  }

  /** Inside a tool or a running job, its caller; anywhere else, this package. */
  private currentCall(): ServiceCall {
    return this.calls.getStore() ?? this.packageCall();
  }

  /** The package itself, at its own grant. */
  private packageCall(): ServiceCall {
    const context = this.getContext();
    return {
      ...packageSelfCall(context.jobAuthority),
      eventContext: { actor: { kind: "service", serviceId: this.id } },
    };
  }

  /** Whether the package declares this type in its header. */
  private ownsType(entityType: string): boolean {
    return this.definition.entities.some(({ type }) => type === entityType);
  }

  /**
   * Where a read of a type looks: the package acting as itself sees its own
   * types at every visibility, and everything else at the caller's.
   */
  private readScope(
    call: ServiceCall,
    entityType: string,
    access: CallerAccess,
  ): CallerAccess["visibilityScope"] {
    return packageReadScope(call, this.ownsType(entityType), access);
  }

  /** Asking other packages over the bus, as this package. */
  private messaging(): ServiceMessaging {
    const context = this.getContext();
    const messaging: ServiceMessaging = {
      request: (contract, request) =>
        context.messaging.request(contract, request),
      command: (contract, request) =>
        context.messaging.command(contract, request),
      async publish(message): Promise<void> {
        // A published message is an event: every subscriber hears it.
        await context.messaging.send({
          type: message.topic,
          payload: message.data,
          broadcast: true,
        });
      },
    };
    return Object.freeze(messaging);
  }

  /**
   * Answer the contracts the `subscriptions` slot binds. Each answer acts as
   * the package, whoever asked, and is released when the package shuts down.
   */
  private registerSubscriptions(context: ServicePluginContext): void {
    if (!this.definition.subscriptions) return;
    const registrations = new WeakMap<
      ServiceSubscriptionBinding,
      () => () => void
    >();
    const answer: ServiceAnswer = (contract, handler) => {
      const delivery: string = contract.delivery;
      if (delivery !== "request" && delivery !== "command") {
        throw new Error(
          `Service "${this.publicId}" cannot answer "${contract.name}": a package answers requests and commands only`,
        );
      }
      // A package answers only what its owner names, the same owner its
      // runtime state is kept under; asking any owner's contract is open.
      const owned = `${this.packageName}:`;
      if (
        !contract.name.startsWith(owned) ||
        contract.name.length === owned.length
      ) {
        throw new Error(
          `Service "${this.publicId}" answers only channels named "${owned}<name>", and "${contract.name}" is not one`,
        );
      }
      // The bus checks the answer against the contract's own schema; erasing
      // the response type here is what lets a handler typed by its input
      // slot hand the bus a value it parses.
      const erased: BusContract<typeof contract.schema, z.ZodType> = contract;
      const binding: ServiceSubscriptionBinding = Object.freeze({
        kind: "rizom-service-subscription-binding",
        contract: erased,
      });
      registrations.set(binding, () =>
        context.messaging.answer(erased, (request, { sender }) =>
          this.calls.run(this.packageCall(), async () =>
            handler({ request, sender }),
          ),
        ),
      );
      return binding;
    };
    const bindings = this.definition.subscriptions(
      this.withRuntime(context, {
        config: this.config,
        state: this.requireState(),
        entities: this.entityAccess(),
        jobs: this.jobs(),
        messaging: this.messaging(),
        answer,
      }),
    );
    const channels = new Set<string>();
    for (const binding of bindings) {
      const register = registrations.get(binding);
      if (!register) {
        throw new Error(
          `Service "${this.publicId}" returns a subscription its own answer did not bind`,
        );
      }
      if (channels.has(binding.contract.name)) {
        throw new Error(
          `Service "${this.publicId}" answers "${binding.contract.name}" more than once`,
        );
      }
      channels.add(binding.contract.name);
      this.answered.push(register());
    }
  }

  /**
   * A slot context with the first-party runtime attached: answers and
   * channels heard through it act as the package, and are released when it
   * shuts down.
   */
  private withRuntime<TContext extends object>(
    context: ServicePluginContext,
    slotContext: TContext,
  ): TContext {
    return withServiceRuntime(slotContext, {
      logger: this.logger,
      messaging: context.messaging,
      deliveryProvider: (channelType) =>
        context.channels.getDeliveryProvider(channelType),
      asPackage: (run) => this.calls.run(this.packageCall(), run),
      onRelease: (release) => {
        this.answered.push(release);
      },
      onReady: (handler) => {
        this.readyHandlers.push(handler);
      },
      onRegistered: (handler) => {
        this.registeredHandlers.push(handler);
      },
      entityShapes: entityShapesOf(context),
      dataDir: context.dataDir,
      identity: Object.freeze({
        get: () => context.identity.get(),
        getProfile: () => context.identity.getProfile(),
      }),
      domain: context.domain,
    });
  }

  /** The declaration that grants a write, or a refusal. */
  private ownedDefinition(
    definition: AnyEntityDefinition,
  ): AnyEntityDefinition {
    const declared = this.definition.entities.find(
      (entity) => entity === definition,
    );
    if (!declared) {
      throw new SdkError("permission_denied", {
        message: `Service "${this.publicId}" may only write the entity types its header declares, and "${definition.type}" is not one of them`,
      });
    }
    return declared;
  }

  /**
   * Held to the type's action policy at the caller's permission level. The
   * policy governs callers: the package acting as itself writes its own
   * types as a class plugin does, and a `never` rule closes a type to system
   * tools, not to the package that owns it.
   */
  private async assertWriteAllowed(
    entityType: string,
    action: "create" | "update" | "delete",
    call: ServiceCall,
  ): Promise<void> {
    await assertOwnedWriteAllowed(
      this.requireShell()
        .getPermissionService()
        .getEntityActionRequiredLevel(entityType, action),
      entityType,
      action,
      call,
    );
  }

  /**
   * The one `entities` a slot is given: definition-typed reads and writes to
   * the header's types, each as the current caller.
   */
  private entityAccess(): ServiceEntityAccess<TEntities[number]> {
    if (this.entityAccessCache) return this.entityAccessCache;
    const context = this.getContext();
    const access: ServiceEntityAccess<AnyEntityDefinition> = {
      ...createPackageEntityReader(
        context.entityService,
        () => this.currentCall(),
        (entityType) => this.ownsType(entityType),
      ),
      ...createOwnedEntityWriter({
        entityService: context.entityService,
        owned: (definition) => this.ownedDefinition(definition),
        currentCall: () => this.currentCall(),
        assertWriteAllowed: (entityType, action, call) =>
          this.assertWriteAllowed(entityType, action, call),
        readScope: (call, entityType, callerAccess) =>
          this.readScope(call, entityType, callerAccess),
      }),
    };
    this.entityAccessCache = Object.freeze(access);
    return this.entityAccessCache;
  }

  private jobs(): ServiceJobs {
    const context = this.getContext();
    // Only this service's own job of that name; another job's result, even
    // one the definition's output schema happens to parse, is not the package's.
    const ownStatus = async <TDefinition extends AnyServiceJobDefinition>(
      definition: TDefinition,
      id: string,
    ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null> => {
      const job = await context.jobs.getStatus(id);
      return job?.type === `${this.id}:${definition.name}`
        ? serviceJobStatus(definition, job)
        : null;
    };
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
        // Refused here, but queued as written: the worker parses it, once.
        definition.input.parse(input);
        const toolContext = this.toolContext.getStore();
        // A tool's or a route's caller starts the job; outside one, this
        // service, and queued by the package acting as itself, the job runs
        // as the package.
        const data = await admitPackageJob(
          context.jobAuthority,
          this.calls.getStore()?.caller,
          input,
        );
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
          status: () => ownStatus(definition, id),
        });
      },
      status: ownStatus,
    };
  }

  private content(): ServiceContentGeneration<string> {
    const context = this.getContext();
    const generationTemplates = this.erasedTemplates();
    const canGenerate = (name: string): boolean =>
      generationTemplates.get(name)?.generation !== undefined;
    return {
      target: (input) => createServiceContentTarget(input, canGenerate),
      generate: async (input): Promise<ServiceContentGenerationResult> => {
        const toolContext = this.toolContext.getStore();
        const result = await context.content.generate({
          targets: [...input.targets],
          toolContext,
          ...(input.force !== undefined && { force: input.force }),
          ...(input.dryRun !== undefined && { dryRun: input.dryRun }),
          ...(toolContext?.signal && { signal: toolContext.signal }),
        });
        // Authors see their local template keys; the result is built typed,
        // and the public schema validates tool output, not this producer.
        return {
          ...result,
          items: result.items.map(
            ({ destination, templateName, ...decision }) => ({
              // The stored ID travels with the path so authors read output
              // back through entity readers without rebuilding an identifier.
              destination: {
                entityType: destination.entityType,
                idPath: destination.idPath,
                entityId: destination.entityId,
              },
              template: unscopeTemplateName(templateName, this.id),
              ...decision,
            }),
          ),
        };
      },
    };
  }

  private templateFormatter(): ServiceTemplateFormatter {
    const formatters = this.erasedTemplates();
    return {
      format(name, value): string {
        const format = formatters.get(name)?.format;
        if (!format) throw new Error(`No template formats as ${name}`);
        return format(value);
      },
    };
  }

  /**
   * Erase each template's schema type where it is still known, binding format
   * to the schema it belongs to. Reading the definition's mapped type as a
   * plain record is not assignable — ServiceTemplateDefinition is
   * contravariant in its schema through `format` — so the erasure happens here
   * rather than being asserted away at the read site.
   */
  private erasedTemplateCache: Map<string, ErasedServiceTemplate> | undefined;

  /** Built once per plugin instance; the definition never changes after construction. */
  private erasedTemplates(): Map<string, ErasedServiceTemplate> {
    this.erasedTemplateCache ??= new Map(
      Object.entries(this.definition.templates ?? {}).map(
        ([name, template]) => {
          const { format, renderers } = template;
          if (!format && !renderers) {
            throw new Error(
              `Service "${this.publicId}" template "${name}" neither formats nor renders`,
            );
          }
          return [
            name,
            {
              schema: template.schema,
              description: template.description,
              generation: template.generation,
              format:
                format &&
                ((value: unknown): string =>
                  format({ value: template.schema.parse(value) })),
              component:
                renderers &&
                ((props: JsonObject): ReturnType<ComponentType<JsonObject>> =>
                  renderers.web(template.schema.parse(props))),
            },
          ];
        },
      ),
    );
    return this.erasedTemplateCache;
  }

  private runtimeTemplates(): Record<string, Template> {
    const result: Record<string, Template> = {};
    for (const [name, template] of this.erasedTemplates()) {
      const { format, component, generation } = template;
      if (generation && !generation.prompt.trim()) {
        throw new Error(
          `Service "${this.publicId}" generation template "${name}" requires a non-empty prompt`,
        );
      }
      if (generation && !format) {
        throw new Error(
          `Service "${this.publicId}" generation template "${name}" must format what it generates`,
        );
      }
      const base = {
        name,
        description: template.description ?? `${this.publicId} ${name}`,
        schema: template.schema,
        requiredPermission: "admin" as const,
        ...(format
          ? {
              formatter: {
                format,
                parse: (): never => {
                  throw new Error(`Template "${name}" is format-only`);
                },
              },
              ...(generation
                ? {
                    basePrompt: generation.prompt,
                    dataSourceId: "shell:ai-content",
                    ...(generation.useKnowledgeContext !== undefined
                      ? { useKnowledgeContext: generation.useKnowledgeContext }
                      : {}),
                  }
                : {}),
            }
          : {}),
      };
      result[name] = component
        ? createTemplate<JsonObject>({
            ...base,
            // The registry stores and serializes what renders, so it is held
            // to JSON; the author's schema stays on the input side, which is
            // what a generation's structured output is derived from.
            schema: template.schema.pipe(jsonObjectSchema),
            layout: { component },
          })
        : createTemplate(base);
    }
    return result;
  }

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
        // What a failure is, if nothing more specific says: refused input
        // until the tool runs, a failed handler while it does, and an
        // invalid response once it has answered.
        let stage: SdkErrorCode = "invalid_input";
        try {
          if (toolContext.signal?.aborted) throw new SdkError("cancelled");
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
          // Refused input says what to fix: the issues describe the caller's
          // own call against the tool's published schema.
          const parsedInput = definition.input.safeParse(rawInput);
          if (!parsedInput.success) {
            throw new SdkError("invalid_input", {
              cause: parsedInput.error,
              publicMessage: formatZodIssues(parsedInput.error, {
                maxLength: SDK_ERROR_MESSAGE_MAX_LENGTH,
              }),
            });
          }
          const input = parsedInput.data;
          if (token === undefined && definition.confirmation) {
            return {
              needsConfirmation: true,
              toolName: name,
              summary:
                typeof definition.confirmation === "function"
                  ? definition.confirmation(input)
                  : definition.confirmation,
              args: confirmations.buildArgs((confirmationToken) => ({
                ...z.record(z.string(), z.unknown()).parse(input),
                [confirmationTokenField]: confirmationToken,
              })),
            };
          }

          stage = "handler_failed";
          const output = await this.toolContext.run(toolContext, () =>
            this.calls.run(this.toolCall(toolContext), () =>
              Promise.resolve(
                definition.execute({
                  input,
                  signal: toolContext.signal ?? new AbortController().signal,
                }),
              ),
            ),
          );
          stage = "invalid_response";
          return {
            success: true,
            data: definition.output.parse(output),
          };
        } catch (error) {
          // The caller is told the failure's public form, as an SdkError
          // publishes it; the diagnostic stays with the brain.
          const failure = toSdkError(
            error,
            toolContext.signal?.aborted ? "cancelled" : stage,
          ).toJSON();
          this.logger.debug("Declared tool failed", {
            tool: name,
            code: failure.code,
            error: getErrorMessage(error),
          });
          return { success: false, error: failure.message, code: failure.code };
        }
      },
    };
  }
}

/** What every registered entity type looks like, read through the plugin's context. */
function entityShapesOf(context: ServicePluginContext): ServiceEntityShapes {
  return Object.freeze({
    types: () => context.entityService.getEntityTypes(),
    frontmatterSchema: (type: string) =>
      context.entities.getEffectiveFrontmatterSchema(type),
    isSingleton: (type: string) =>
      context.entities.getAdapter(type)?.isSingleton === true,
    bodyTemplate: (type: string) =>
      context.entities.getAdapter(type)?.getBodyTemplate() ?? "",
  });
}

export function createDeclarativeServicePlugin<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
>(
  definition: NormalizedServiceDefinitionInput<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities
  >,
  config: z.output<TConfigSchema>,
  metadata: InstalledPluginPackageMetadata,
  id: string,
  /** The plugins a first-party class declared it depends on; none otherwise. */
  dependencies: readonly string[] = [],
): DeclarativeServicePlugin<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TAccountSettings,
  TTemplateDefinitions,
  TEntities
> {
  return new DeclarativeServicePlugin(
    definition,
    config,
    metadata,
    id,
    dependencies,
  );
}
