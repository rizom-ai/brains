import type { BusContract, Channel, WebRouteRole } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { RecurringCheckDefinition } from "@brains/recurring-checks";
import type { ToolContext } from "@brains/mcp-service";
import type { RegisteredWebRoute } from "../types/web-routes";
import type {
  IInboxFollowUpsNamespace,
  IInboxNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IProfileKindsNamespace,
} from "../base/context-types";
import type { IEntityAINamespace } from "../entity/ai-types";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { ChannelDeliveryProvider } from "../channel-registry";
import type { AuthBackend } from "../contracts/auth";
import type { StudioWorkspaceRegistration } from "../contracts/studio-workspace-contracts";
import type { BuiltInStudioWorkspaceSource } from "../operator/studio-workspace-runtime";
import type {
  BaseEntity,
  ContentVisibility,
  CountEntitiesRequest,
  CreateEntityRequest,
  EntityMutationResult,
  GetEntityRequest,
  ListEntitiesRequest,
  NearestEntity,
  NearestToEntityRequest,
  PersistValidator,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
  UpdateEntityRequest,
} from "@brains/entity-service";
import type { Template } from "@brains/templates";
import type { DashboardWidgetRenderer } from "../contracts/dashboard-widget-contracts";
import type {
  AnyDashboardWidgetDefinition,
  AnyStudioWorkspaceDefinition,
} from "../operator/operator-definition-contract";
import type { SchemaValue } from "../internal/schema-value";
import {
  buildServiceTool,
  type ServiceBusDelivery,
  type ServiceInputSchema,
  type ServiceSchema,
  type ServiceToolDefinition,
} from "./service-definition-contract";

/**
 * Internal, first-party only: what a first-party service converted from a
 * class needs and the public service contract does not offer. No public entry
 * exports it; a first-party package reaches the runtime with
 * `serviceRuntime(context)` on a slot context the brain built.
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

const firstPartyToolName = /^[a-z][a-z0-9_-]*$/u;

/** The first-party tools registered under their name as written. */
const bareNamedTools = new WeakSet<object>();

/**
 * Whether a first-party tool keeps the bare name its class gave it
 * (`playbook_manage`) rather than one prefixed with its service's id.
 */
export function isBareNamedTool(tool: object): boolean {
  return bareNamedTools.has(tool);
}

/**
 * A tool as `defineTool` declares one, whose local name may also carry an
 * underscore, as a first-party class's tools were named
 * (`atproto-registry_check_contracts`). The public `defineTool` keeps its
 * kebab-case rule. With `bareName`, the tool is registered under its name
 * as written, as a class that named its tool in full registered it
 * (`playbook_manage`, `inbox_list`), not prefixed with its service's id.
 */
export function firstPartyTool<
  const TName extends string,
  TInputSchema extends ServiceInputSchema,
  const TOutputSchema extends ServiceSchema,
>(
  definition: Omit<
    ServiceToolDefinition<TName, TInputSchema, TOutputSchema>,
    "kind"
  >,
  options: { readonly bareName?: boolean | undefined } = {},
): ServiceToolDefinition<TName, TInputSchema, TOutputSchema> {
  if (!firstPartyToolName.test(definition.name)) {
    throw new Error(
      `First-party tool name "${definition.name}" must start with a lowercase letter and contain only lowercase letters, numbers, hyphens and underscores`,
    );
  }
  const tool = buildServiceTool(definition);
  if (options.bareName === true) bareNamedTools.add(tool);
  return tool;
}

/**
 * Where a channel is heard, as a class subscribed to it: `subscribe` in the
 * main process only, `observe` from the main process for what every process
 * raises, and `execution` in every process, each hearing its own.
 */
export type ServiceListenMode = "subscribe" | "observe" | "execution";

/** What hearing a channel is handed: its payload. */
export type ServiceListenHandler<TPayload> = (context: {
  readonly payload: TPayload;
}) => void | Promise<void>;

export interface ServiceListenOptions {
  readonly mode?: ServiceListenMode | undefined;
}

/** What a registered entity type looks like to a package that renders it. */
export interface ServiceEntityShapes {
  /** Every registered entity type. */
  types(): string[];
  /** The type's frontmatter schema with every extension; none when unknown. */
  frontmatterSchema(type: string): z.ZodObject<z.ZodRawShape> | undefined;
  /** Whether the type keeps one record; false when unknown. */
  isSingleton(type: string): boolean;
  /** The body a new record of the type starts with; empty when unknown. */
  bodyTemplate(type: string): string;
}

/** The internal capabilities a first-party service's slot context carries. */
export interface ServiceRuntime {
  /** The package's logger, as its class logged. */
  readonly logger: Logger;
  /**
   * Answer a first-party contract under the channel it already has, such as
   * `notifications:send`, as the package; with `everyProcess`, in job
   * workers too, as the class answered it. The public `answer` answers only
   * channels its package names. Released when the package shuts down.
   */
  answer<const TRequest extends z.ZodType, const TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, ServiceBusDelivery>,
    handler: (context: {
      readonly request: z.output<TRequest>;
      readonly sender: string;
    }) => SchemaValue<TResponse> | Promise<SchemaValue<TResponse>>,
    options?: { readonly everyProcess?: boolean | undefined },
  ): void;
  /**
   * Hear a system or broadcast channel, as the package: through its typed
   * channel the payload is validated and a malformed one is never handed on;
   * by name it is handed on as sent. Released when the package shuts down.
   */
  listen<TPayload>(
    channel: Channel<TPayload>,
    handler: ServiceListenHandler<TPayload>,
    options?: ServiceListenOptions,
  ): void;
  listen(
    channel: string,
    handler: ServiceListenHandler<unknown>,
    options?: ServiceListenOptions,
  ): void;
  /** The transport registered for a recipient's channel type, if any. */
  deliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
  /**
   * Run once the brain is ready, as the package: after every plugin has
   * registered and the shell has prepared its ready state, where the class's
   * onReady ran. Handlers run in the order they were given.
   */
  ready(handler: () => void | Promise<void>): void;
  /**
   * Run once every plugin has registered, as the package, in every process,
   * where the class's onRegistrationComplete ran: before the initial sync,
   * after every package has registered what it contributes. A handler that
   * fails fails the brain's registration. Handlers run in order.
   */
  registered(handler: () => void | Promise<void>): void;
  /** The shape of every registered entity type, read-only. */
  readonly entityShapes: ServiceEntityShapes;
  /** Where the brain keeps its data on disk. */
  readonly dataDir: string;
  /**
   * The brain's character and its anchor's profile, as the shell's identity
   * caches hold them now, read-only.
   */
  readonly identity: ServiceIdentity;
  /** The brain's bare domain, when it has one. */
  readonly domain: string | undefined;
  /**
   * The auth backend the brain bound, read when asked, as the class read
   * `context.auth.get()`: none while the brain runs without auth-service.
   */
  auth(): AuthBackend | undefined;
  /**
   * Studio, for a workspace the package composes from declared ones, as
   * admin composes its Administration tabs. Call it once every plugin has
   * registered, where the class registered its workspaces.
   */
  readonly studio: ServiceStudio;
  /**
   * The Inbox sources other plugins registered, as the class read them
   * through `context.inbox`; a reader registers none.
   */
  readonly inbox: Pick<IInboxNamespace, "listSources" | "getSource">;
  /**
   * The follow-ups the Inbox's destinations resolve for an item, as the
   * class read them through `context.inboxFollowUps`.
   */
  readonly inboxFollowUps: Pick<IInboxFollowUpsNamespace, "resolve">;
  /**
   * Register a recurring check under the plugin's id, in every process, as
   * the class registered it through `context.recurringChecks`.
   */
  recurringCheck(check: RecurringCheckDefinition): void;
  /**
   * Offer a way into the brain, as the class registered one through
   * `context.interactions`; a worker offers none.
   */
  interaction(interaction: ServiceInteraction): void;
  /**
   * The URL Studio serves one of this package's workspaces at, once Studio
   * took it; none before, or without a Studio.
   */
  workspaceUrl(workspace: AnyStudioWorkspaceDefinition): string | undefined;
  /** The brain's site URL, when it has a domain. */
  readonly siteUrl: string | undefined;
  /** The route another plugin mounts for a well-known role, if any. */
  routeByRole(role: WebRouteRole): RegisteredWebRoute | undefined;
  /**
   * The tool call that is running, as the class's handler was handed it:
   * the conversation it was called in and the caller's permission level.
   * None outside a tool call.
   */
  toolCall(): ServiceToolCall | undefined;
  /**
   * Read-only reads of the brain's entities, passed through to the entity
   * service at the scope each call names, as the class read them: the
   * registered types, counts by type, a page of a type and one record. It
   * writes nothing.
   */
  readonly entityReads: ServiceEntityReads;
  /**
   * Claim a shell system type for this package: it alone keeps the type's
   * records, as the class kept them. A type that is not one of the shell's
   * own, one nobody registered, and one another package claimed are
   * refused. Released when the package shuts down.
   */
  claim(type: string): ClaimedSystemType;
  /**
   * The brain's profile-kind catalog, as the class registered kinds into
   * it and read the selected one once registration completed.
   */
  readonly profileKinds: IProfileKindsNamespace;
  /** One structured answer from the brain's AI, as the class asked it. */
  readonly ai: Pick<IEntityAINamespace, "generateObject">;
  /**
   * Serve a data source under `<plugin id>:<id>`, as an entity plugin class
   * registered one: `fetch` reads the corpus at the build's scope, through
   * the entity service the build hands the data source, and the runtime
   * validates what it returns against the caller's schema.
   */
  dataSource(declaration: ServiceDataSourceDeclaration): void;
  /**
   * Register a template built with the internal template builder under
   * `<plugin id>:<name>`, such as a site section that names a data source
   * and keeps its own overlay formatter.
   */
  template(name: string, template: Template): void;
  /**
   * A Dashboard widget that draws itself, as the class's built-in widget
   * did: registered once every plugin has registered, never in a worker, its
   * `load` reading the corpus at the viewer's scope.
   */
  dashboardWidget<TDefinition extends AnyDashboardWidgetDefinition>(
    widget: ServiceDashboardWidget<TDefinition>,
  ): void;
}

/** What a running tool call says about itself, as a class's handler read it. */
export type ServiceToolCall = Pick<
  ToolContext,
  "conversationId" | "userPermissionLevel"
>;

/** A way into the brain, as `context.interactions` registers one. */
export type ServiceInteraction = Parameters<
  IInteractionsNamespace["register"]
>[0];

/**
 * The Studio a first-party service composes a workspace for, as its class
 * registered one.
 */
export interface ServiceStudio {
  /** Whether a Studio hosts workspaces in this process: never in a worker. */
  isAvailable(): boolean;
  /**
   * A declared workspace built under the plugin's id, as a tab another
   * workspace loads; it is never registered on its own.
   */
  source<TDefinition extends AnyStudioWorkspaceDefinition>(
    input: BuiltInStudioWorkspaceSource<TDefinition>,
  ): Omit<StudioWorkspaceRegistration, "pluginId">;
  /**
   * Register a composed workspace with Studio: the URL Studio serves it at,
   * or none when no Studio took it or the process is a worker. As the class
   * registered it, it stays registered until Studio goes.
   */
  register(
    registration: Omit<StudioWorkspaceRegistration, "pluginId">,
  ): Promise<string | undefined>;
}

/** The corpus reads a map draws from, passed through to an entity service. */
export interface ServiceCorpusReads {
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  countEntities(request: CountEntitiesRequest): Promise<number>;
  nearestToEntity(request: NearestToEntityRequest): Promise<NearestEntity[]>;
  projectSemanticSpace(
    request: ProjectSemanticSpaceRequest,
  ): Promise<SemanticSpaceProjection>;
}

export interface ServiceDataSourceDeclaration {
  /** Local id; the runtime scopes it to the plugin. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  fetch(
    query: unknown,
    context: {
      readonly corpus: ServiceCorpusReads;
      /** True for a production build, which shows only published records. */
      readonly publishedOnly: boolean;
    },
  ): Promise<unknown>;
}

export interface ServiceDashboardWidget<
  TDefinition extends AnyDashboardWidgetDefinition,
> {
  readonly definition: TDefinition;
  /** The widget's own component and styles, in place of the declarative body. */
  readonly render: DashboardWidgetRenderer;
  load(provider: {
    readonly corpus: ServiceCorpusReads;
    /** What the viewer may read: pass it to every read. */
    readonly visibilityScope: ContentVisibility;
    readonly signal: AbortSignal;
  }): z.input<TDefinition["data"]> | Promise<z.input<TDefinition["data"]>>;
}

/** The entity service's reads a first-party class made, and nothing that writes. */
export interface ServiceEntityReads {
  getEntityTypes(): string[];
  getEntityCounts(
    visibilityScope?: ContentVisibility,
  ): Promise<Array<{ entityType: string; count: number }>>;
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
}

/** Who the brain is and whom it represents, as the shell keeps them. */
export interface ServiceIdentity {
  get(): BrainCharacter;
  getProfile(): AnchorProfile;
}

/** What the runtime binds a first-party service's runtime to. */
export interface ServiceRuntimeBinding {
  readonly logger: Logger;
  readonly messaging: IMessagingNamespace;
  readonly deliveryProvider: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  /** Runs a handler as the package acting as itself. */
  readonly asPackage: <T>(run: () => Promise<T>) => Promise<T>;
  /** Keeps a release to run when the package shuts down. */
  readonly onRelease: (release: () => void) => void;
  /** Keeps a handler to run once the brain is ready. */
  readonly onReady: (handler: () => Promise<void>) => void;
  /** Keeps a handler to run once every plugin has registered. */
  readonly onRegistered: (handler: () => Promise<void>) => void;
  readonly entityShapes: ServiceEntityShapes;
  readonly dataDir: string;
  readonly identity: ServiceIdentity;
  readonly domain: string | undefined;
  readonly auth: () => AuthBackend | undefined;
  readonly studio: ServiceStudio;
  readonly inbox: Pick<IInboxNamespace, "listSources" | "getSource">;
  readonly inboxFollowUps: Pick<IInboxFollowUpsNamespace, "resolve">;
  readonly recurringCheck: (check: RecurringCheckDefinition) => void;
  readonly interaction: (interaction: ServiceInteraction) => void;
  readonly workspaceUrl: (
    workspace: AnyStudioWorkspaceDefinition,
  ) => string | undefined;
  readonly siteUrl: string | undefined;
  readonly routeByRole: (role: WebRouteRole) => RegisteredWebRoute | undefined;
  readonly toolCall: () => ServiceToolCall | undefined;
  readonly entityReads: ServiceEntityReads;
  readonly claim: (type: string) => ClaimedSystemType;
  readonly profileKinds: IProfileKindsNamespace;
  readonly ai: Pick<IEntityAINamespace, "generateObject">;
  readonly dataSource: (declaration: ServiceDataSourceDeclaration) => void;
  readonly template: (name: string, template: Template) => void;
  readonly dashboardWidget: <TDefinition extends AnyDashboardWidgetDefinition>(
    widget: ServiceDashboardWidget<TDefinition>,
  ) => void;
}

const serviceRuntimeKey = Symbol("rizom.first-party-service-runtime");

function bindServiceRuntime(binding: ServiceRuntimeBinding): ServiceRuntime {
  const { messaging, asPackage, onRelease, onReady, onRegistered } = binding;
  const runtime: ServiceRuntime = {
    logger: binding.logger,
    deliveryProvider: binding.deliveryProvider,
    entityShapes: binding.entityShapes,
    dataDir: binding.dataDir,
    identity: binding.identity,
    domain: binding.domain,
    auth: binding.auth,
    studio: binding.studio,
    inbox: binding.inbox,
    inboxFollowUps: binding.inboxFollowUps,
    recurringCheck: binding.recurringCheck,
    interaction: binding.interaction,
    workspaceUrl: binding.workspaceUrl,
    siteUrl: binding.siteUrl,
    routeByRole: binding.routeByRole,
    toolCall: binding.toolCall,
    entityReads: binding.entityReads,
    claim: binding.claim,
    profileKinds: binding.profileKinds,
    ai: binding.ai,
    dataSource: binding.dataSource,
    template: binding.template,
    dashboardWidget: binding.dashboardWidget,
    ready(handler): void {
      onReady(() => asPackage(async () => handler()));
    },
    registered(handler): void {
      onRegistered(() => asPackage(async () => handler()));
    },
    answer(contract, handler, options = {}): void {
      // The bus checks the answer against the contract's own schema, as the
      // public answer does; erasing the response type is what lets a handler
      // typed by its contract hand the bus a value it parses.
      const erased: BusContract<typeof contract.schema, z.ZodType> = contract;
      onRelease(
        messaging.answer(
          erased,
          (request, { sender }) =>
            asPackage(async () => handler({ request, sender })),
          options.everyProcess === true ? { everyProcess: true } : {},
        ),
      );
    },
    listen(
      channel: Channel<unknown> | string,
      handler: ServiceListenHandler<unknown>,
      options: ServiceListenOptions = {},
    ): void {
      const mode = options.mode ?? "subscribe";
      const hear = async (payload: unknown): Promise<{ success: true }> => {
        await asPackage(async () => handler({ payload }));
        return { success: true };
      };
      onRelease(
        typeof channel === "string"
          ? // By name, the payload is handed on as sent.
            subscribeByName(messaging, mode, channel, (message) =>
              hear(message.payload),
            )
          : subscribeTyped(messaging, mode, channel, hear),
      );
    },
  };
  return Object.freeze(runtime);
}

function subscribeTyped<TPayload>(
  messaging: IMessagingNamespace,
  mode: ServiceListenMode,
  channel: Channel<TPayload>,
  handler: (payload: TPayload) => Promise<{ success: true }>,
): () => void {
  switch (mode) {
    case "observe":
      return messaging.observe(channel, handler);
    case "execution":
      return messaging.subscribeExecution(channel, handler);
    case "subscribe":
      return messaging.subscribe(channel, handler);
  }
}

function subscribeByName(
  messaging: IMessagingNamespace,
  mode: ServiceListenMode,
  channel: string,
  handler: (message: { readonly payload: unknown }) => Promise<{
    success: true;
  }>,
): () => void {
  switch (mode) {
    case "observe":
      return messaging.observe(channel, handler);
    case "execution":
      return messaging.subscribeExecution(channel, handler);
    case "subscribe":
      return messaging.subscribe(channel, handler);
  }
}

/**
 * A slot context the runtime hands a first-party service, with its internal
 * runtime attached under a key no public type names.
 */
export function withServiceRuntime<TContext extends object>(
  context: TContext,
  binding: ServiceRuntimeBinding,
): TContext {
  Object.defineProperty(context, serviceRuntimeKey, {
    value: bindServiceRuntime(binding),
    enumerable: false,
    writable: false,
    configurable: false,
  });
  return context;
}

function isServiceRuntime(value: unknown): value is ServiceRuntime {
  return typeof value === "object" && value !== null;
}

/**
 * The internal runtime a first-party service's slot context carries.
 * First-party packages only: a context the brain's runtime did not build,
 * such as a test double, has none, and is refused.
 */
export function serviceRuntime(context: object): ServiceRuntime {
  const runtime: unknown = Reflect.get(context, serviceRuntimeKey);
  if (!isServiceRuntime(runtime)) {
    throw new Error(
      "This context carries no service runtime: serviceRuntime() reaches internal capabilities of a slot context the brain's runtime built, for first-party packages only",
    );
  }
  return runtime;
}

/**
 * The shell's own entity types a first-party package may claim: the brain's
 * character and its anchor's profile, which the shell registers before any
 * plugin and no plugin owns.
 */
export const claimableSystemTypes: ReadonlySet<string> = new Set([
  "anchor-profile",
  "brain-character",
]);

/**
 * A shell system type one first-party package claims, as profile claims the
 * anchor profile and the brain character: its stored records, read and
 * written as the package as the class read and wrote them, past the action
 * policy and with `expectedContentHash` honored, and its frontmatter
 * extension and persist validator. Every call names the claimed type; any
 * other is refused.
 */
export interface ClaimedSystemType {
  readonly type: string;
  getEntity(request: GetEntityRequest): Promise<BaseEntity | null>;
  listEntities(request: ListEntitiesRequest): Promise<BaseEntity[]>;
  createEntity(
    request: CreateEntityRequest<BaseEntity>,
  ): Promise<EntityMutationResult>;
  updateEntity(
    request: UpdateEntityRequest<BaseEntity>,
  ): Promise<EntityMutationResult>;
  extendFrontmatterSchema(extension: z.ZodObject<z.ZodRawShape>): void;
  registerPersistValidator(validator: PersistValidator): void;
}
