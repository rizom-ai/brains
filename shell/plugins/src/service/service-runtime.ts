import type { BusContract, Channel, WebRouteRole } from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type { RecurringCheckDefinition } from "@brains/recurring-checks";
import type { ToolContext } from "@brains/mcp-service";
import type { EnqueueJobRequest, JobInfo } from "@brains/job-queue";
import type { IRuntimeStateNamespace } from "@brains/runtime-state";
import type { EvalHandler } from "../contracts/handlers";
import type { IShell } from "../interfaces";
import type { RegisteredWebRoute } from "../types/web-routes";
import type {
  IInboxFollowUpsNamespace,
  IInboxNamespace,
  IInteractionsNamespace,
  IMessagingNamespace,
  IPermissionsNamespace,
  IProfileKindsNamespace,
} from "../base/context-types";
import type { IAttachmentsNamespace } from "./attachment-registry";
import type { RetryScope } from "@brains/utils/retry-backoff";
import type { IEntityAINamespace } from "../entity/ai-types";
import type { IServiceContentNamespace } from "./context";
import type { IViewsNamespace } from "../entity/namespaces";
import type { ResolutionOptions } from "@brains/content-service";
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { ChannelDeliveryProvider } from "../channel-registry";
import type { AuthBackend } from "../contracts/auth";
import type { FirstPartyStudio } from "../operator/studio-workspace-runtime";
import type {
  BaseEntity,
  ContentVisibility,
  CountEntitiesRequest,
  CreateEntityRequest,
  EntityMutationResult,
  GetEntityRawRequest,
  GetEntityRequest,
  IEntityService,
  ListEntitiesRequest,
  EntitySearchRequest,
  SearchResult,
  NearestEntity,
  NearestToEntityRequest,
  PersistValidator,
  ProjectSemanticSpaceRequest,
  SemanticSpaceProjection,
  UpdateEntityRequest,
} from "@brains/entity-service";
import type { Template } from "@brains/templates";
import type { EntityDisplayEntry } from "@brains/site-composition";
import type { SystemChannelName } from "../system-channels";
import type { DashboardWidgetRenderer } from "../contracts/dashboard-widget-contracts";
import type {
  AnyDashboardWidgetDefinition,
  AnyStudioWorkspaceDefinition,
} from "../operator/operator-definition-contract";
import type { SchemaValue } from "../internal/schema-value";
import {
  attachFirstPartyRuntime,
  firstPartyRuntimeOf,
} from "../internal/first-party-runtime";
import {
  buildServiceTool,
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

/**
 * What hearing a channel is handed: its payload, and the sender the bus
 * stamped on it, which a listener checks before it trusts what it heard.
 */
export type ServiceListenHandler<TPayload> = (context: {
  readonly payload: TPayload;
  readonly sender: string;
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
   * workers too, as the class answered it. A request, a command, or a
   * contract every owner answers and the asker gathers
   * (`agent:context:request`), beside the others that answer it. The
   * public `answer` answers only channels its package names and never a
   * gathered one. Released when the package shuts down.
   */
  answer<const TRequest extends z.ZodType, const TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse>,
    handler: (context: {
      readonly request: z.output<TRequest>;
      readonly sender: string;
    }) => SchemaValue<TResponse> | Promise<SchemaValue<TResponse>>,
    options?: { readonly everyProcess?: boolean | undefined },
  ): void;
  /**
   * Hear a broadcast channel, as the package: through its typed channel the
   * payload is validated and a malformed one is never handed on. A system
   * lifecycle channel (`SYSTEM_CHANNELS`) may also be heard by name, for a
   * handler that reads no payload; it is handed on as sent. Released when
   * the package shuts down.
   */
  listen<TPayload>(
    channel: Channel<TPayload>,
    handler: ServiceListenHandler<TPayload>,
    options?: ServiceListenOptions,
  ): void;
  listen(
    channel: SystemChannelName,
    handler: ServiceListenHandler<unknown>,
    options?: ServiceListenOptions,
  ): void;
  /**
   * Ask the bus as the class asked through `context.messaging`, as the
   * package, from wherever it builds what it serves: a request's one owner,
   * a command every hearer takes, every owner of a collect contract, and an
   * event broadcast on its typed channel to every hearer.
   */
  readonly messaging: ServiceClassMessaging;
  /**
   * Register the package's agent instructions again, under the plugin's
   * id, as the class did through `context.registerInstructions` when what
   * they say changed.
   */
  instructions(instructions: string): void;
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
  /**
   * The brain's view templates, as the class read them through
   * `context.views`: one by its full name, and every one registered.
   */
  readonly views: ServiceViews;
  /**
   * A template's content, as the class resolved it through
   * `context.templates.resolve`: by its full name, or one local to the
   * plugin under its id, with the options the caller names (saved content,
   * a data query, a fallback, the scope it reads at); none for a template
   * nobody registered.
   */
  resolveTemplate(
    templateName: string,
    options?: ResolutionOptions,
  ): Promise<unknown>;
  /**
   * Queue a job as the class queued it through `context.jobs`: the type
   * scoped to the plugin unless it names a scope, sourced to the plugin,
   * attributed to the call the request names and to nobody when it names
   * none; and read a job's status and the recent jobs of its types, as the
   * class read them.
   */
  readonly jobs: ServiceClassJobs;
  /**
   * Writes of any type, handed to the entity service as written, as the
   * class wrote them through `context.entityService`: with the attribution
   * and options the request names, and no action policy beyond the store's.
   */
  readonly entityWrites: ServiceEntityWrites;
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
  /** The preview site's URL, when the brain has a domain. */
  readonly previewUrl: string | undefined;
  /**
   * The site's local URL, and whether links prefer it over the public one,
   * as the class read them.
   */
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  /**
   * The site's entity display, as registration hands it: each type's
   * label and the page its records live on, which routes and links follow.
   */
  readonly entityDisplay:
    Readonly<Record<string, EntityDisplayEntry>> | undefined;
  /** The route another plugin mounts for a well-known role, if any. */
  routeByRole(role: WebRouteRole): RegisteredWebRoute | undefined;
  /**
   * The tool call that is running, as the class's handler was handed it:
   * the conversation it was called in and the caller's permission level.
   * None outside a tool call.
   */
  toolCall(): ServiceToolCall | undefined;
  /**
   * The runtime state the class stored, under the namespace the class named
   * (`playbooks.runs`) rather than one qualified by the package's name, so
   * the records stored before the conversion are the ones it reads after.
   */
  readonly classRuntimeState: Pick<IRuntimeStateNamespace, "scoped">;
  /**
   * Register an eval handler under the plugin's id (`playbooks:goalCheck`),
   * as the class registered it through `context.eval`; a worker registers
   * none.
   */
  evalHandler(handlerId: string, handler: EvalHandler): void;
  /**
   * Read-only reads of the brain's entities, passed through to the entity
   * service at the scope each call names, as the class read them: the
   * registered types, counts by type, a page of a type and one record. It
   * writes nothing.
   */
  readonly entityReads: ServiceEntityReads;
  /**
   * The brain's entity action policy, checked for a caller as the class
   * checked it through `context.permissions.assertEntityActionAllowed`:
   * a caller below the level a type's action needs is refused.
   */
  readonly permissions: ServicePermissions;
  /**
   * The attachments other packages provide for their records, as the class
   * read them through `context.attachments`: whether a source type
   * provides one, and the attachment, resolved by its provider.
   */
  readonly attachments: ServiceAttachments;
  /**
   * Background retries the package owns, as its class's `this.retries`:
   * work a refusal must not lose, retried with backoff, every retry stopped
   * when the package shuts down.
   */
  readonly retries: RetryScope;
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
  /**
   * One structured answer from the brain's AI, and a bounded verdict from
   * its judge, as the class asked them.
   */
  readonly ai: ServiceAI;
  /**
   * Serve a data source under `<plugin id>:<id>`, as an entity plugin class
   * registered one: `fetch` reads the corpus at the build's scope, through
   * the entity service the build hands the data source, and the runtime
   * validates what it returns against the caller's schema. With
   * `asWritten`, under its id as written, as a service class registered one
   * it named in full (`site:navigation`).
   */
  dataSource(
    declaration: ServiceDataSourceDeclaration,
    options?: ServiceDataSourceOptions,
  ): void;
  /**
   * Register a template built with the internal template builder under
   * `<plugin id>:<name>`, such as a site section that names a data source
   * and keeps its own overlay formatter; with a namespace, under
   * `<namespace>:<name>`, as a class registered the section templates its
   * config defines (`landing-page:hero`).
   */
  template(
    name: string,
    template: Template,
    options?: ServiceTemplateOptions,
  ): void;
  /**
   * Ask the content service to generate, as the class asked through
   * `context.content.generate`: the targets as written, a template name
   * local to the plugin or in full, with the tool call's caller the request
   * names, or the package's own configured grant without one.
   */
  generateContent(
    request: Parameters<IServiceContentNamespace["generate"]>[0],
  ): ReturnType<IServiceContentNamespace["generate"]>;
  /**
   * A Dashboard widget as the class's built-in widget was, drawing itself
   * or its declared view: registered once every plugin has registered, never
   * in a worker, its `load` reading the corpus at the viewer's scope.
   */
  dashboardWidget<TDefinition extends AnyDashboardWidgetDefinition>(
    widget: ServiceDashboardWidget<TDefinition>,
  ): void;
}

/** Where a template registers: under the plugin's id unless it names a namespace. */
export interface ServiceTemplateOptions {
  readonly namespace?: string | undefined;
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
export type ServiceStudio = FirstPartyStudio;

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

export interface ServiceDataSourceOptions {
  /** Register under the id as written rather than `<plugin id>:<id>`. */
  readonly asWritten?: boolean | undefined;
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
  /**
   * The widget's own component and styles, in place of the declarative body;
   * unset, the widget draws its declared view, as a declarative one does.
   */
  readonly render?: DashboardWidgetRenderer | undefined;
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
  /**
   * One record as stored, its references left unresolved, at the scope the
   * request names: what an identifier lookup reads by id.
   */
  getEntityRaw(request: GetEntityRawRequest): Promise<BaseEntity | null>;
  /** A search of the brain at the scope the request names. */
  search(request: EntitySearchRequest): Promise<SearchResult<BaseEntity>[]>;
}

/** The entity action policy check a class made, and nothing that sets one. */
export type ServicePermissions = Pick<
  IPermissionsNamespace,
  "assertEntityActionAllowed"
>;

/** The attachment reads a class made, and nothing that registers one. */
export type ServiceAttachments = Pick<
  IAttachmentsNamespace,
  "resolve" | "hasProvider"
>;

/** The view templates a class read, and nothing that registers one. */
export type ServiceViews = Pick<IViewsNamespace, "get" | "list">;

/** The bus as a class asked it, and nothing that answers or hears. */
export type ServiceClassMessaging = Pick<
  IMessagingNamespace,
  "request" | "command" | "gather" | "broadcast"
>;

/** The job queue as a class queued through it. */
export interface ServiceClassJobs {
  enqueue(request: EnqueueJobRequest): Promise<string>;
  /** A job's status, by its id; none for a job the queue does not hold. */
  getStatus(jobId: string): Promise<JobInfo | null>;
  /** The latest jobs of the types named, newest first, at most `limit`. */
  getRecentJobs(types?: string[], limit?: number): Promise<JobInfo[]>;
  /** The jobs pending or running, of the types named or of every type. */
  getActiveJobs(types?: string[]): Promise<JobInfo[]>;
}

/** The entity service's writes a first-party class made. */
export type ServiceEntityWrites = Pick<
  IEntityService,
  "createEntity" | "updateEntity"
>;

/** What a first-party service asks the brain's AI. */
export interface ServiceAI extends Pick<IEntityAINamespace, "generateObject"> {
  readonly judge: IShell["judge"];
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
  readonly instructions: (instructions: string) => void;
  /** Runs a handler as the package acting as itself. */
  readonly asPackage: <T>(run: () => Promise<T>) => Promise<T>;
  /** Keeps a release to run when the package shuts down. */
  readonly onRelease: (release: () => void) => void;
  /** Keeps a handler to run once the brain is ready. */
  readonly onReady: (handler: () => Promise<void>) => void;
  /** Keeps a handler to run once every plugin has registered. */
  readonly onRegistered: (handler: () => Promise<void>) => void;
  readonly entityShapes: ServiceEntityShapes;
  readonly views: ServiceViews;
  readonly resolveTemplate: ServiceRuntime["resolveTemplate"];
  readonly jobs: ServiceClassJobs;
  readonly entityWrites: ServiceEntityWrites;
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
  readonly previewUrl: string | undefined;
  readonly localSiteUrl: string | undefined;
  readonly preferLocalUrls: boolean;
  readonly entityDisplay:
    Readonly<Record<string, EntityDisplayEntry>> | undefined;
  readonly routeByRole: (role: WebRouteRole) => RegisteredWebRoute | undefined;
  readonly toolCall: () => ServiceToolCall | undefined;
  readonly classRuntimeState: Pick<IRuntimeStateNamespace, "scoped">;
  readonly evalHandler: (handlerId: string, handler: EvalHandler) => void;
  readonly entityReads: ServiceEntityReads;
  readonly permissions: ServicePermissions;
  readonly attachments: ServiceAttachments;
  readonly retries: RetryScope;
  readonly claim: (type: string) => ClaimedSystemType;
  readonly profileKinds: IProfileKindsNamespace;
  readonly ai: ServiceAI;
  readonly dataSource: (
    declaration: ServiceDataSourceDeclaration,
    options?: ServiceDataSourceOptions,
  ) => void;
  readonly template: (
    name: string,
    template: Template,
    options?: ServiceTemplateOptions,
  ) => void;
  readonly generateContent: ServiceRuntime["generateContent"];
  readonly dashboardWidget: <TDefinition extends AnyDashboardWidgetDefinition>(
    widget: ServiceDashboardWidget<TDefinition>,
  ) => void;
}

const serviceRuntimeKey = Symbol("rizom.first-party-service-runtime");

/** Every runtime the brain bound, so one read back is known to be one. */
const boundServiceRuntimes = new WeakSet<object>();

function bindServiceRuntime(binding: ServiceRuntimeBinding): ServiceRuntime {
  const { messaging, asPackage, onRelease, onReady, onRegistered } = binding;
  const runtime: ServiceRuntime = {
    logger: binding.logger,
    messaging: Object.freeze({
      request: (contract, payload) => messaging.request(contract, payload),
      command: (contract, payload) => messaging.command(contract, payload),
      gather: (contract, payload) => messaging.gather(contract, payload),
      broadcast: (channel, payload) => messaging.broadcast(channel, payload),
    } satisfies ServiceClassMessaging),
    deliveryProvider: binding.deliveryProvider,
    instructions: binding.instructions,
    entityShapes: binding.entityShapes,
    views: binding.views,
    resolveTemplate: binding.resolveTemplate,
    jobs: binding.jobs,
    entityWrites: binding.entityWrites,
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
    previewUrl: binding.previewUrl,
    localSiteUrl: binding.localSiteUrl,
    preferLocalUrls: binding.preferLocalUrls,
    entityDisplay: binding.entityDisplay,
    routeByRole: binding.routeByRole,
    toolCall: binding.toolCall,
    classRuntimeState: binding.classRuntimeState,
    evalHandler: binding.evalHandler,
    entityReads: binding.entityReads,
    permissions: binding.permissions,
    attachments: binding.attachments,
    retries: binding.retries,
    claim: binding.claim,
    profileKinds: binding.profileKinds,
    ai: binding.ai,
    dataSource: binding.dataSource,
    template: binding.template,
    generateContent: binding.generateContent,
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
      const hear = async (
        payload: unknown,
        sender: string,
      ): Promise<{ success: true }> => {
        await asPackage(async () => handler({ payload, sender }));
        return { success: true };
      };
      onRelease(
        typeof channel === "string"
          ? // By name, the payload is handed on as sent.
            subscribeByName(messaging, mode, channel, (message) =>
              hear(message.payload, message.source),
            )
          : subscribeTyped(messaging, mode, channel, (payload, message) =>
              hear(payload, message.source),
            ),
      );
    },
  };
  return Object.freeze(runtime);
}

function subscribeTyped<TPayload>(
  messaging: IMessagingNamespace,
  mode: ServiceListenMode,
  channel: Channel<TPayload>,
  handler: (
    payload: TPayload,
    message: { readonly source: string },
  ) => Promise<{ success: true }>,
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
  handler: (message: {
    readonly payload: unknown;
    readonly source: string;
  }) => Promise<{
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
  const runtime = bindServiceRuntime(binding);
  boundServiceRuntimes.add(runtime);
  return attachFirstPartyRuntime(context, serviceRuntimeKey, runtime);
}

function isServiceRuntime(value: object | undefined): value is ServiceRuntime {
  return value !== undefined && boundServiceRuntimes.has(value);
}

/**
 * The internal runtime a first-party service's slot context carries.
 * First-party packages only: a context the brain's runtime did not build,
 * such as a test double, has none, and is refused.
 */
export function serviceRuntime(context: object): ServiceRuntime {
  const runtime = firstPartyRuntimeOf(context, serviceRuntimeKey);
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
