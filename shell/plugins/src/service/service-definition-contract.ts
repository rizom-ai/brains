import type { UserPermissionLevel } from "@brains/templates";
import type { ToolContext } from "../interfaces";
import type { LoggerContract } from "@brains/utils/logger";
import type { AnySubscriptionDefinition } from "../contracts/subscription";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type {
  IInboxFollowUpsNamespace,
  IInboxNamespace,
} from "../base/context-types";
import type { AnyInterfaceRouteDefinition } from "../interface/route-contract";
import type { ChannelDeliveryProvider } from "../channel-registry";
import type { ToolAgent, ToolAsk } from "./tool-agent";

/**
 * Looking up a transport, not the registry that holds them.
 *
 * A service asks "what delivers to this channel type"; registering a
 * descriptor or a provider belongs to the interface that owns the channel.
 */
/**
 * One entity a service declares into existence.
 *
 * `markdown` is a loader rather than a string so a satisfied seed costs no
 * file read; the runtime parses it through the target type's own adapter.
 */
/**
 * A frontmatter extension and/or persistence validator for one entity type
 * in the declaring package's owned set. See `entityExtensions`.
 */
export interface ServiceEntityExtension {
  readonly entityType: string;
  readonly frontmatter?: z.ZodObject<z.ZodRawShape> | undefined;
  readonly validate?:
    ((entity: BaseEntity) => void | Promise<void>) | undefined;
}

/** A way in this service offers; see `interactions`. */
export interface ServiceInteractionDeclaration {
  readonly id: string;
  readonly label: string;
  readonly description?: string | undefined;
  readonly href: string;
  readonly kind: "human" | "agent" | "admin" | "protocol";
  readonly priority?: number | undefined;
  readonly visibility?: UserPermissionLevel | undefined;
  readonly requiresActiveSession?: boolean | undefined;
}

export interface ServiceSeedDefinition {
  readonly entityType: string;
  readonly id: string;
  markdown(): string | Promise<string>;
}

/**
 * What shape each entity type takes, read-only.
 *
 * A generator that renders the brain's types into another tool's vocabulary
 * asks three questions per type: its frontmatter schema, whether it is a
 * singleton, and its body template. The registry's full namespace also
 * registers and extends types, which a reader has no business doing.
 * Named consumer: @brains/obsidian-vault.
 */
export interface ServiceEntityShapes {
  frontmatterSchema(entityType: string): z.ZodObject<z.ZodRawShape> | undefined;
  isSingleton(entityType: string): boolean;
  bodyTemplate(entityType: string): string;
}

/** The narrow publish surface a service gets, not the whole bus. */
export interface ServicePublisher {
  send(message: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;
}

export interface ServiceChannelReader {
  getDeliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
}
import type { z } from "@brains/utils/zod";
import type {
  ProfileKindDefinition,
  ResolvedProfileSelection,
} from "@brains/identity-service";
import type { BaseEntity } from "@brains/entity-service";
import type { AnyDataSourceDeclaration } from "../public/entity-data-source";
import type {
  AnyEntityDefinition,
  EntityEvalContext,
  EntityInsightDeclaration,
  EntityPublishDeclaration,
  ProjectionDefinition,
} from "../entity/entity-definition-contract";
import type {
  JobEntityAccess,
  JobHandlerContext,
  JobTemplateFormatter,
} from "../job/job-context-contract";
import type { ProjectionRule } from "../entity/projection-rule";
import type { AIGenerationSchema } from "../entity/ai-types";
import type { DirectMcpExposure } from "@brains/mcp-service";
import type {
  IRuntimeStateStore,
  RuntimeStateScopeOptions,
} from "@brains/runtime-state";
import type {
  EntityInboxDeclaration,
  EntityReactionContext,
} from "../entity/entity-definition-contract";
import type {
  RecurringCheckCadence,
  RecurringCheckResult,
} from "@brains/recurring-checks";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type {
  AnyStudioWorkspaceDefinition,
  AnyDashboardWidgetDefinition,
  BoundStudioWorkspace,
  BoundDashboardWidget,
} from "../operator/operator-definition-contract";
import type { OperatorBindingContext } from "../operator/operator-context-contract";
import { assertIdentifier } from "../package-definition";

export type ServiceSchema = z.ZodType<unknown, unknown>;
export type ServiceInputSchema = z.ZodObject<z.ZodRawShape>;
export type ServiceSchemaMap = Record<string, ServiceSchema>;
export type ServiceDeadline = `${number}ms` | `${number}s` | `${number}m`;

export interface ServiceMessagePublisher {
  publish(input: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

export interface ServiceJobProgress {
  readonly progress: number;
  readonly total?: number | undefined;
  readonly message?: string | undefined;
}

export interface ServiceProgressReporter {
  report(input: ServiceJobProgress): Promise<void>;
}

/**
 * An eval handler on a service package.
 *
 * Takes the same capability context an entity-side eval gets, on top of the
 * config and state its declaration closes over. An eval that measures a
 * configured pipeline needs both halves — the config that shaped it, and the
 * access to seed and read what it produced — and getting only one half is
 * what drove packages to reach for the raw plugin context instead.
 */
export type ServiceEvalHandler = (
  input: unknown,
  context: EntityEvalContext,
) => Promise<unknown>;

export interface ServiceTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

/**
 * A service-declared job always has templates — only entity-declared jobs
 * run in a context without them. Saying so here keeps `templates?.format()`
 * out of every service job that renders anything.
 */
export type ServiceJobHandlerContext<TInput> = JobHandlerContext<TInput> & {
  readonly templates: JobTemplateFormatter;
};

export type ServiceJobHandler<TInput, TOutput> = (
  context: ServiceJobHandlerContext<TInput>,
) => Promise<TOutput>;

export interface ServiceJobBinding<
  TDefinition extends ServiceJobDefinition = ServiceJobDefinition,
> {
  readonly kind: "rizom-service-job-binding";
  readonly definition: TDefinition;
}

const jobHandlers = new WeakMap<
  ServiceJobBinding,
  ServiceJobHandler<unknown, unknown>
>();

export interface ServiceJobDefinition<
  TName extends string = string,
  TInputSchema extends ServiceSchema = ServiceSchema,
  TOutputSchema extends ServiceSchema = ServiceSchema,
> {
  readonly kind: "rizom-service-job";
  readonly name: TName;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly retry?: { readonly attempts: number } | undefined;
  readonly deadline?: ServiceDeadline | undefined;
  handle(
    handler: ServiceJobHandler<z.output<TInputSchema>, z.input<TOutputSchema>>,
  ): ServiceJobBinding<
    ServiceJobDefinition<TName, TInputSchema, TOutputSchema>
  >;
}

export type AnyServiceJobDefinition = ServiceJobDefinition<
  string,
  ServiceSchema,
  ServiceSchema
>;

export function defineJob<
  const TName extends string,
  TInputSchema extends ServiceSchema,
  TOutputSchema extends ServiceSchema,
>(definition: {
  readonly name: TName;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  readonly retry?: { readonly attempts: number } | undefined;
  readonly deadline?: ServiceDeadline | undefined;
}): ServiceJobDefinition<TName, TInputSchema, TOutputSchema> {
  assertIdentifier(definition.name, "Job name");
  if (
    definition.retry &&
    (!Number.isInteger(definition.retry.attempts) ||
      definition.retry.attempts < 1)
  ) {
    throw new Error(
      `Job "${definition.name}" retry attempts must be at least 1`,
    );
  }
  if (definition.deadline) parseServiceDeadline(definition.deadline);

  const job: ServiceJobDefinition<TName, TInputSchema, TOutputSchema> = {
    kind: "rizom-service-job",
    ...definition,
    handle(handler) {
      const binding: ServiceJobBinding<
        ServiceJobDefinition<TName, TInputSchema, TOutputSchema>
      > = Object.freeze({
        kind: "rizom-service-job-binding",
        definition: job,
      });
      jobHandlers.set(binding, handler as ServiceJobHandler<unknown, unknown>);
      return binding;
    },
  };
  return Object.freeze(job);
}

export function getServiceJobHandler(
  binding: ServiceJobBinding,
): ServiceJobHandler<unknown, unknown> {
  const handler = jobHandlers.get(binding);
  if (!handler) {
    throw new Error(
      `Job "${binding.definition.name}" was not created by defineJob().handle()`,
    );
  }
  return handler;
}

export function parseServiceDeadline(deadline: ServiceDeadline): number {
  const match = /^(\d+)(ms|s|m)$/u.exec(deadline);
  if (!match) throw new Error(`Invalid job deadline "${deadline}"`);
  const amount = Number(match[1]);
  if (!Number.isSafeInteger(amount) || amount < 1) {
    throw new Error(`Job deadline "${deadline}" must be positive`);
  }
  const unit = match[2];
  return amount * (unit === "m" ? 60_000 : unit === "s" ? 1_000 : 1);
}

export interface ServiceJobStatus<TOutput> {
  readonly id: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly progress: ServiceJobProgress | null;
  readonly result?: TOutput | undefined;
  readonly error?: string | undefined;
}

export interface ServiceJobReference<
  TDefinition extends AnyServiceJobDefinition,
> {
  readonly id: string;
  status(): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null>;
}

export interface ServiceJobs {
  enqueue<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<ServiceJobReference<TDefinition>>;
  status<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null>;
}

export interface ServiceToolDefinition<
  TName extends string = string,
  TInputSchema extends ServiceInputSchema = ServiceInputSchema,
  TOutputSchema extends ServiceSchema = ServiceSchema,
> {
  readonly kind: "rizom-service-tool";
  readonly name: TName;
  readonly description: string;
  readonly input: TInputSchema;
  readonly output: TOutputSchema;
  /**
   * What the person is being asked to agree to.
   *
   * A function of the input when the answer depends on it: approving "grant
   * trusted access" without seeing to whom is not a decision anyone can
   * make. A plain string when the act is the same every time.
   */
  readonly confirmation?:
    string | ((input: z.output<TInputSchema>) => string) | undefined;
  readonly permission?: UserPermissionLevel | undefined;
  readonly sideEffects?: "none" | "writes" | "external" | undefined;
  /**
   * Whether the LLM agent may call this tool itself. Defaults to true. Some
   * tools exist for people — an analytics readout a human asks for over MCP
   * is not something the agent should reach for unprompted. Named consumer:
   * @brains/analytics.
   */
  readonly agentTool?: boolean | undefined;
  /**
   * Whether an external protocol client sees this tool directly.
   *
   * Defaults from `sideEffects` — a read is basic, a write is debug-only —
   * which is right for a tool that acts on the brain and wrong for one that
   * *is* the conversation: `chat` writes, and a client with no way to call
   * it has no way in at all. Named consumer: @brains/mcp.
   */
  readonly directMcpExposure?: DirectMcpExposure | undefined;
  /**
   * Entity access and a permission check, because most tools do something to
   * the brain's own records — and whether the caller may is only knowable
   * when they call.
   */
  execute(
    context: EntityReactionContext & {
      readonly input: z.output<TInputSchema>;
      readonly signal: AbortSignal;
      /**
       * Who is asking. A tool that grants trust or edits a record has to
       * attribute the act to someone, and permission is a fact about the
       * caller rather than about the tool.
       */
      readonly caller: ToolContext | undefined;
      /**
       * The brain, for a tool that *is* the conversation rather than a
       * capability within one. Only a tool declaring `agentTool: false`
       * may reach it — see `createToolAgent`. Named consumer: @brains/mcp.
       */
      readonly agent: ToolAgent;
    },
  ):
    | z.input<TOutputSchema>
    | ToolAsk
    | Promise<z.input<TOutputSchema> | ToolAsk>;
}

export type AnyServiceToolDefinition = ServiceToolDefinition<
  string,
  ServiceInputSchema,
  ServiceSchema
>;

export function defineTool<
  const TName extends string,
  TInputSchema extends ServiceInputSchema,
  TOutputSchema extends ServiceSchema,
>(
  definition: Omit<
    ServiceToolDefinition<TName, TInputSchema, TOutputSchema>,
    "kind"
  >,
): ServiceToolDefinition<TName, TInputSchema, TOutputSchema> {
  assertIdentifier(definition.name, "Tool name");
  if (!definition.description.trim()) {
    throw new Error(`Tool "${definition.name}" description must not be empty`);
  }
  return Object.freeze({ kind: "rizom-service-tool", ...definition });
}

/**
 * A scheduled check a service declares. Same shape as an entity's, with the
 * service's own reaction context.
 */
export interface ServiceCheckDeclaration {
  readonly id: string;
  readonly cadence: RecurringCheckCadence;
  readonly deliverAlerts?: boolean | undefined;
  readonly includeInInbox?: boolean | undefined;
  run(
    context: EntityReactionContext & {
      readonly signal: AbortSignal;
      /**
       * Where a workspace this package declared ended up, once Studio
       * scoped and mounted it.
       *
       * A check that alerts someone has to say where to go, and the id it
       * wrote is not the id the runtime registered. Undefined when Studio
       * is not mounted, which is the honest answer: there is no page.
       * Named consumer: @brains/unified-inbox.
       */
      readonly workspaceUrl: (workspaceId: string) => string | undefined;
    },
  ): Promise<RecurringCheckResult>;
}

export interface ServiceLifecycle {
  onCleanup(cleanup: () => void | Promise<void>): void;
}

/**
 * One piece of evidence: what matched, and the record it matched in.
 *
 * The whole record rather than the excerpt alone, because the caller is
 * deciding something on it — an excerpt says a document is relevant, and
 * whether it settles a question is a different read.
 */
export interface ServiceCorpusHit {
  readonly entityType: string;
  readonly id: string;
  readonly excerpt: string;
  readonly content: string;
  readonly metadata: unknown;
  readonly score: number;
}

/**
 * Semantic read across the whole corpus, for answering a question.
 *
 * `excludeTypes` is here because the package asking is usually one of the
 * types stored: a playbook looking for evidence that its goal was met must
 * not find the playbook that states the goal.
 */
export interface ServiceCorpusSearch {
  search(request: {
    readonly query: string;
    readonly limit?: number | undefined;
    readonly excludeTypes?: readonly string[] | undefined;
  }): Promise<readonly ServiceCorpusHit[]>;
}

/**
 * Ask the model to decide, and get the decision in a shape you named.
 *
 * The usage figures the shell tracks are deliberately not returned: a
 * package that acts on a verdict has no use for the token count, and one
 * that reports on spend is asking a different question.
 */
export type ServiceJudge = <TVerdict>(input: {
  readonly instruction: string;
  readonly material: string;
  readonly schema: AIGenerationSchema<TVerdict>;
}) => Promise<{ readonly verdict: TVerdict }>;

export interface ServiceResourceDefinition {
  readonly uri: string;
  readonly description?: string | undefined;
  readonly mimeType?: string | undefined;
  read(): string | Promise<string>;
}

export interface ServicePromptDefinition<TSchema extends ServiceSchema> {
  readonly description?: string | undefined;
  readonly input: TSchema;
  render(context: { readonly input: z.output<TSchema> }): string;
}

export interface ServiceTemplateDefinition<TSchema extends ServiceSchema> {
  readonly schema: TSchema;
  format(context: { readonly value: z.output<TSchema> }): string;
}

export interface ServiceViewDefinition<TSchema extends ServiceSchema> {
  readonly schema: TSchema;
  readonly description?: string | undefined;
  readonly renderers: {
    readonly web: string | ((value: z.output<TSchema>) => string);
  };
}

/**
 * A publish provider a service supplies, named with the entity type it serves.
 *
 * The entity-side declaration needs no entityType — it is attached to one.
 * A service can serve any type its package declares, so it says which.
 */
export interface ServicePublishDeclaration extends EntityPublishDeclaration {
  readonly entityType: string;
}

interface ServiceDefinitionCore<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
  readonly id: string;
  readonly config: TConfigSchema;
  /**
   * Entity types this package owns.
   *
   * Data, not a function of config: an entity declaration is static, and the
   * runtime has to build its plugin synchronously at instantiation, before
   * `setup` has produced any state. Behaviour that needs config — a job that
   * reads an API key — belongs in `jobs`, which is a function of config.
   */
  readonly entities?: readonly AnyEntityDefinition[] | undefined;
  /**
   * System entity types whose lifecycle this package manages.
   *
   * Stewarded types join the package's owned set for scoped entity access,
   * so its jobs and ready hook may write them. The claim is checked at
   * registration: the type must already be registered — a system type the
   * shell brought up, never one this package invents — and no other package
   * may steward it. Named consumer: @brains/profile, whose starter-identity
   * flow seeds and migrates the shell-owned anchor-profile and
   * brain-character singletons.
   */
  readonly stewards?: readonly string[] | undefined;
  /**
   * Plugin ids this service must register after.
   *
   * A seeder that writes another package's entity type has to run once that
   * type exists; the runtime already orders registration by dependency, and
   * this names them. Named consumer: @brains/onboarding, which seeds
   * playbooks.
   */
  readonly dependsOn?: readonly string[] | undefined;
  readonly projections?: readonly ProjectionDefinition[] | undefined;
  /**
   * Projection rules that read configuration.
   *
   * A function of config, unlike the entity-side slot, for the same reason
   * `jobs` is: whether a rule exists at all, and what thresholds it derives
   * with, can be configured. Each rule joins the entity plugin whose type it
   * targets, so the runtime sees it as that entity's rule.
   */
  readonly projectionRules?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        /**
         * The scoped name of a template this package declares.
         *
         * A rule that generates has to name a template, and the runtime
         * owns template scoping. Left to write the prefix itself, a package
         * hardcodes a name that stops resolving the moment its scope
         * changes — and the failure lands at derive time, long after
         * registration would have caught it.
         */
        readonly template: (localName: string) => string;
      }) => readonly ProjectionRule[])
    | undefined;
  /**
   * What the service holds while it runs, built once at registration.
   *
   * **Write this before any slot that destructures `state`.** The state type
   * is inferred from what `setup` returns, and a destructured parameter above
   * it resolves its context while that type is still unknown — which silently
   * fixes `state` to an empty object rather than failing.
   */
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly lifecycle: ServiceLifecycle;
        /**
         * Finding the transport that serves a channel type.
         *
         * A service that routes an alert does not name a transport — a new one
         * becomes reachable by registering a delivery provider, not by
         * changing the router. Named consumer: @brains/notifications.
         */
        readonly channels: ServiceChannelReader;
        /**
         * Where the running auth implementation is published, so a package
         * whose surfaces all need it can capture it once into state instead
         * of resolving it per call. Named consumer: @brains/admin.
         */
        readonly auth: IAuthRegistry;
        /**
         * The inbox registries other packages file into. A service that
         * presents the whole inbox reads what they registered rather than
         * owning a list of its own. Named consumer: @brains/unified-inbox.
         */
        readonly inbox: IInboxNamespace;
        readonly inboxFollowUps: IInboxFollowUpsNamespace;
        /**
         * Evidence from across the corpus, for a package that has to answer
         * a question rather than render a type it owns.
         *
         * Semantic and read-only, capped to what an admin may see.
         * Deliberately not the entity service: this looks for evidence and
         * cannot write. Named consumers: @brains/playbooks,
         * @brains/dashboard.
         */
        readonly corpus: ServiceCorpusSearch;
        /**
         * The types this package owns, for state that has to read them long
         * after registration.
         *
         * `ready` already receives this; a package whose engine reads its own
         * definitions on an agent's request, not a caller's, needs the same
         * handle held rather than passed per call. Scoped to owned types, so
         * it is not a way into the rest of the brain.
         * Named consumer: @brains/playbooks.
         */
        readonly entities: JobEntityAccess;
        /**
         * Bookkeeping that is not an entity, for the same kind of state.
         *
         * A run in progress is not content, nobody browses it, and it should
         * not survive a rebuild of what it is about. The reaction context
         * offers this per call; it is here because the thing that writes
         * runs is built once, at registration.
         * Named consumer: @brains/playbooks.
         */
        readonly state: <TValue>(
          options: RuntimeStateScopeOptions<TValue>,
        ) => IRuntimeStateStore<TValue>;
        /**
         * Put evidence to the model and get a verdict back in a shape you
         * named. Bounded on purpose — an instruction, the material, and a
         * schema — so what returns is a decision rather than prose the
         * package then has to parse. Named consumer: @brains/playbooks.
         */
        readonly judge: ServiceJudge;
        readonly logger: LoggerContract;
      }) => TState | Promise<TState>)
    | undefined;
  /**
   * Requests this service answers on the message bus.
   *
   * Jobs, tools and checks are all things the runtime asks for. A request
   * arriving on a topic is not one of them, and until now a service had to
   * reach past its context for `messaging.subscribe` to answer one.
   * Named consumer: @brains/notifications.
   */
  /**
   * HTTP routes this service serves.
   *
   * The same vocabulary interfaces declare — `defineRoute`, with its
   * security, body and response validation — because a route is a route
   * whichever family declares it. The registry publishing canonical lexicon
   * JSON and the dashboard serving operator pages are services with routes,
   * not interfaces. Named consumer: @brains/atproto-registry.
   */
  readonly routes?:
    | ((context: {
        // Config alone, deliberately: composition tooling enumerates routes
        // from an uninstantiated definition to answer "what does this brain
        // serve", and state does not exist until registration. A route whose
        // behaviour needs state closes over it; its existence may not.
        readonly config: z.output<TConfigSchema>;
      }) => readonly AnyInterfaceRouteDefinition[])
    | undefined;
  /**
   * Entities that should exist before anyone authors them — including
   * another package's types.
   *
   * Job-scoped writes refuse types a package does not own, and that rule
   * holds: a seeder *declares* what should exist and the runtime performs
   * the write, once, only when nothing with that id exists at any
   * visibility. The markdown loads lazily, so a seed that is already
   * satisfied costs no file read. Dispatched before `ready`, ordered behind
   * `dependsOn`. Named consumer: @brains/onboarding, which seeds playbooks.
   */
  readonly seeds?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly ServiceSeedDefinition[])
    | undefined;
  /**
   * Profile kinds this package contributes to the app-scoped catalog.
   *
   * A kind is data — a name, a category, a field schema, labels — and the
   * brain's configuration picks one; the registry finalizes the selection
   * after every plugin has registered. A function of config for parity with
   * the other declaration slots. Named consumer: @brains/profile, which
   * declares the built-in professional, team and organization kinds.
   */
  readonly profileKinds?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => readonly ProfileKindDefinition[])
    | undefined;
  /**
   * Frontmatter and persistence validation this package adds to entity
   * types it stewards or declares.
   *
   * Evaluated after every plugin has registered and the profile-kind
   * selection has finalized — an extension shaped by the selected kind has
   * no answer earlier. Restricted to the package's owned set: reshaping a
   * type is a stewardship act, not something one package does to another's.
   * Named consumer: @brains/profile, which extends anchor-profile with the
   * base profile fields and the selected kind's fields.
   */
  readonly entityExtensions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly profileKinds: {
          getResolved(): ResolvedProfileSelection;
          getSelectedDefinition(): ProfileKindDefinition | undefined;
        };
      }) => readonly ServiceEntityExtension[])
    | undefined;
  /**
   * Work that runs once, after every plugin has registered.
   *
   * `setup` runs during this package's own registration, when the types it
   * wants to read may not exist yet. A seeder asks "is the playbook already
   * there?" and that question has no answer until the playbook package has
   * registered its type. The runtime dispatches this after registration
   * completes, ordered behind `dependsOn`. Named consumer: @brains/onboarding.
   */
  readonly ready?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly entities: JobEntityAccess;
        readonly messaging: ServicePublisher;
        readonly logger: LoggerContract;
        /** The brain's data directory, for artifacts written beside it. */
        readonly dataDir: string;
        readonly entityShapes: ServiceEntityShapes;
        /**
         * The declared jobs, for boot-time enqueueing. Work that belongs in
         * `ready` is often only the trigger — the work itself is a job, with
         * the queue's retries and observability. Named consumer:
         * @brains/profile, whose ready enqueues starter-identity seeding.
         */
        readonly jobs: ServiceJobs;
        /**
         * Where the running auth implementation is published, or undefined
         * in a brain without one. A console surface resolves the caller
         * behind its own routes; asking the runtime is what replaces
         * reaching for a module-level global in auth-service.
         * Named consumers: @brains/admin, @brains/studio, @brains/dashboard.
         */
        readonly auth: IAuthRegistry;
      }) => void | Promise<void>)
    | undefined;
  readonly subscriptions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /**
         * The declared jobs, so a bus signal can enqueue work instead of
         * doing it inline in the handler. Named consumer: @brains/profile,
         * which seeds once the initial sync reports success.
         */
        readonly jobs: ServiceJobs;
      }) => readonly AnySubscriptionDefinition[])
    | undefined;
  /**
   * Ways in that this service offers a person or an agent — a console link
   * to a workspace it registers, say. Declared rather than registered from
   * a lifecycle hook so the list is readable without running the plugin.
   * Named consumer: @brains/unified-inbox.
   */
  readonly interactions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /**
         * Where a workspace this package declared ended up. A console link
         * points at a page Studio mounted, and the path is the runtime's to
         * decide. Undefined when Studio is not mounted — a way in that
         * leads nowhere is one worth not declaring.
         */
        readonly workspaceUrl: (workspaceId: string) => string | undefined;
      }) => readonly ServiceInteractionDeclaration[])
    | undefined;
  readonly instructions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => string | Promise<string>)
    | undefined;
  readonly resources?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => Record<string, ServiceResourceDefinition>)
    | undefined;
  readonly prompts?:
    | {
        readonly [K in keyof TPromptSchemas]: ServicePromptDefinition<
          TPromptSchemas[K]
        >;
      }
    | undefined;
  /**
   * Data sources this package contributes that belong to no single entity
   * type.
   *
   * The entity-side slot covers a source over one type. A source that spans
   * the corpus — the knowledge map arranges every type in semantic space —
   * has no type to hang off, and neither does one built from a package's
   * own configured state. The runtime scopes their ids to the package, so
   * two packages can each declare "entities" without colliding.
   *
   * Named consumers: @brains/knowledge-map, @brains/dashboard,
   * @brains/site-builder, @brains/unified-inbox.
   */
  readonly dataSources?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnyDataSourceDeclaration[])
    | undefined;
  readonly templates?:
    | {
        readonly [K in keyof TTemplateSchemas]: ServiceTemplateDefinition<
          TTemplateSchemas[K]
        >;
      }
    | undefined;
  readonly views?:
    | {
        readonly [K in keyof TViewSchemas]: ServiceViewDefinition<
          TViewSchemas[K]
        >;
      }
    | undefined;
  readonly jobs?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly ServiceJobBinding[])
    | undefined;
  /**
   * Eval handlers, keyed by the `handler:` name their test cases use.
   *
   * A function of config and state for the same reason `jobs` is: an eval
   * that exercises an integration needs the same credentials the integration
   * uses, and the entity-side `evals` slot deliberately has no config.
   */
  /**
   * Scheduled work this service does, as a function of config.
   *
   * A function rather than a list because whether a check runs, and whether
   * it raises alerts, is usually configured — a directory scan that notifies
   * on new peers is a different check from one that does not.
   */
  readonly checks?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly ServiceCheckDeclaration[])
    | undefined;
  /**
   * What this service puts in front of a person to act on.
   *
   * A function of config for the same reason: what belongs in an inbox
   * depends on what the operator asked to be told about.
   */
  readonly inbox?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => EntityInboxDeclaration)
    | undefined;
  readonly evals?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /** As on `projectionRules`: an eval that drives a rule names the
         * same template the rule does, and neither writes the prefix. */
        readonly template: (localName: string) => string;
      }) => Record<string, ServiceEvalHandler>)
    | undefined;
  /**
   * Insights this service contributes, keyed by insight id.
   *
   * A function of config and state for the same reason `jobs` and `evals`
   * are: an insight that reports on an integration needs the client that
   * integration was configured with.
   */
  readonly insights?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => EntityInsightDeclaration)
    | undefined;
  readonly tools?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly jobs: ServiceJobs;
        readonly templates: ServiceTemplateFormatter;
      }) => readonly AnyServiceToolDefinition[])
    | undefined;
  /**
   * Publish providers this package supplies, and the entity types they serve.
   *
   * A function of config and state, unlike the entity-side `publish` slot: a
   * provider that reaches an external network is built from credentials, and
   * a package with none configured supplies no provider at all. Return an
   * empty list to publish nothing.
   */
  readonly publish?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /** Providers reach the outside world, so they report what happens. */
        readonly logger: LoggerContract;
      }) => readonly ServicePublishDeclaration[])
    | undefined;
  readonly dashboardWidgets?:
    | ((
        context: OperatorBindingContext<
          z.output<TConfigSchema>,
          TState,
          TAccountSettings
        >,
      ) => readonly BoundDashboardWidget<
        AnyDashboardWidgetDefinition,
        z.output<TConfigSchema>,
        TState,
        TAccountSettings
      >[])
    | undefined;
  readonly studioWorkspaces?:
    | ((
        context: OperatorBindingContext<
          z.output<TConfigSchema>,
          TState,
          TAccountSettings
        >,
      ) => readonly BoundStudioWorkspace<
        AnyStudioWorkspaceDefinition,
        z.output<TConfigSchema>,
        TState,
        TAccountSettings
      >[])
    | undefined;
}

export type NormalizedServiceDefinitionInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionCore<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TViewSchemas,
  TAccountSettings
> & { readonly accountSettings: TAccountSettings };

export type ServiceDefinitionInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TViewSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionCore<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TViewSchemas,
  TAccountSettings
> &
  (TAccountSettings extends AnyAccountSettingsDefinition
    ? { readonly accountSettings: TAccountSettings }
    : { readonly accountSettings?: undefined });
