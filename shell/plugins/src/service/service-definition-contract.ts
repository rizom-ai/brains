import type {
  ComponentType,
  TemplateDataSchema,
  UserPermissionLevel,
} from "@brains/templates";
import type { ContentFormatter } from "@brains/content-formatters";
import type { JsonObject } from "@brains/contracts";
import type { ToolContext } from "../interfaces";
import type { LoggerContract } from "@brains/utils/logger";
import type { AnySubscriptionDefinition } from "../contracts/subscription";
import type { IAuthRegistry } from "../contracts/auth-registry";
import type {
  IInboxFollowUpsNamespace,
  IInboxNamespace,
} from "../base/context-types";
import type { AnyInterfaceRouteDefinition } from "../interface/route-contract";
import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "../channel-registry";
import type { OperationalHealthProvider } from "../operational-health-registry";
import type { EntityMirror } from "./entity-mirror";
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
  /**
   * Whether a type carries a body beneath its frontmatter. An editor
   * refuses a body sent for a type that has none, rather than storing it.
   * Named consumer: @brains/studio.
   */
  hasBody(entityType: string): boolean;
  /**
   * What a type's markdown means, as its own adapter says. An editor
   * assembles an entity from a form and writes markdown; the adapter is what
   * turns that back into the entity's parts. Nothing for a type nobody
   * registered. Named consumer: @brains/studio.
   */
  parse(entityType: string, markdown: string): Partial<BaseEntity> | undefined;
}

/** The narrow publish surface a service gets, not the whole bus. */
export interface ServicePublisher {
  /**
   * Ask, and read the answer: the first subscriber that answers does.
   *
   * Called `request` because that is what it is, and because the reaction
   * context has always called it that. Two names for one operation is how a
   * package ends up believing `send` is fire-and-forget and dropping the
   * answer on the floor. Broadcasting to everyone listening is `publish`.
   */
  request(message: {
    readonly type: string;
    readonly payload: unknown;
  }): Promise<unknown>;
  /**
   * Announce, to everyone listening. A discovery or a failure is not a
   * question for one subscriber; every package that cares hears it.
   * Named consumer: @brains/atproto.
   */
  publish(message: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

export interface ServiceChannelReader {
  getDeliveryProvider(channelType: string): ChannelDeliveryProvider | undefined;
  /**
   * Every channel the brain can be reached on, as the registry describes
   * them. A console that reports on the brain counts them; nothing here
   * registers one. Named consumer: @brains/studio.
   */
  listDescriptors(): ChannelDescriptor[];
}
import type { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
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
  RoutedCreate,
  TemplateCapabilityReport,
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
import type { AnchorProfile, BrainCharacter } from "../contracts/identity";
import type { AppInfo } from "../contracts/app-info";
import type { PublicSkill } from "../a2a/public-skills";
import type {
  IPermissionsNamespace,
  IPluginsNamespace,
} from "../base/context-types";
import type { IAttachmentsNamespace } from "./attachment-registry";
import type { StaticSiteOutput } from "../contracts/http-host";
import type { IServiceTemplatesNamespace, IViewsNamespace } from "./context";
import type {
  ConsoleSurface,
  SurfacePermissionLevel,
} from "../console-surfaces";
import type { ServicePublishingAccess } from "./publish-delegation-registry";
import type { OperatorEntityWrites } from "./operator-entities";
import type { RuntimeReadiness } from "../contracts/runtime-health";
import type { EntityDisplayEntry } from "@brains/site-composition";

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

/**
 * What a service formats and generates with, which is what a job handler
 * gets: the same reads, reached from a tool or a job alike.
 */
export type ServiceTemplateFormatter = JobTemplateFormatter;

/**
 * What the setup context answers about the templates a brain composed.
 *
 * A tool that decides which page sections are worth filling in asks about
 * templates other packages registered; resolving one is a different act
 * from asking what it can do. Named consumer: @brains/site-content.
 */
export interface ServiceTemplateReads extends Pick<
  IServiceTemplatesNamespace,
  "resolve"
> {
  capabilities(name: string): TemplateCapabilityReport | null;
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

/**
 * What a job is told once the queue has settled it: the input it ran with,
 * and whether it completed or, after every retry, failed.
 */
export interface ServiceJobSettledContext<TInput> {
  readonly input: TInput;
  readonly jobId: string;
  readonly outcome: "completed" | "failed";
  /** The failure the queue recorded; absent when the job completed. */
  readonly error?: Error | undefined;
}

export type ServiceJobSettledHandler<TInput> = (
  context: ServiceJobSettledContext<TInput>,
) => Promise<void>;

/**
 * Hooks around a job's run that the queue drives rather than the handler.
 *
 * `settled` runs once, after the queue has durably recorded the terminal
 * state — after retries, which is why it is not folded into the handler: a
 * throwing run may still be retried, and a child of a bulk mutation is only
 * accounted for once the queue has given up or succeeded.
 * Named consumer: @brains/directory-sync.
 */
export interface ServiceJobHooks<TInput> {
  readonly settled?: ServiceJobSettledHandler<TInput> | undefined;
}

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
const jobSettledHandlers = new WeakMap<
  ServiceJobBinding,
  ServiceJobSettledHandler<unknown>
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
  /**
   * At most one of these waiting at a time, per key.
   *
   * Work that renders whatever the brain says when it runs gains nothing
   * from being queued twice: the job already waiting will see the same
   * changes. Return the key that means "the same work" — a job already
   * pending under that key makes this request a no-op, and the waiting
   * job's id comes back instead. Work already running does not block a new
   * request, because that one will not see what changed since it started.
   * Named consumer: @brains/site-builder.
   */
  readonly oncePending?:
    ((input: z.output<TInputSchema>) => string) | undefined;
  handle(
    handler: ServiceJobHandler<z.output<TInputSchema>, z.input<TOutputSchema>>,
    hooks?: ServiceJobHooks<z.output<TInputSchema>>,
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
  /**
   * At most one of these waiting at a time, per key.
   *
   * Work that renders whatever the brain says when it runs gains nothing
   * from being queued twice: the job already waiting will see the same
   * changes. Return the key that means "the same work" — a job already
   * pending under that key makes this request a no-op, and the waiting
   * job's id comes back instead. Work already running does not block a new
   * request, because that one will not see what changed since it started.
   * Named consumer: @brains/site-builder.
   */
  readonly oncePending?:
    ((input: z.output<TInputSchema>) => string) | undefined;
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
    handle(handler, hooks) {
      const binding: ServiceJobBinding<
        ServiceJobDefinition<TName, TInputSchema, TOutputSchema>
      > = Object.freeze({
        kind: "rizom-service-job-binding",
        definition: job,
      });
      const settled = hooks?.settled;
      if (settled) {
        jobSettledHandlers.set(binding, async (context) =>
          settled({
            ...context,
            input: parseWithSchema<TInputSchema>(job.input, context.input),
          }),
        );
      }
      // Erase here, where TInputSchema is known. A handler taking
      // Context<TInput> is not assignable to one taking Context<unknown> —
      // that is contravariance, and asserting it away would let an unvalidated
      // input reach the handler. Parsing through the job's own input schema is
      // what makes the erased signature true.
      jobHandlers.set(binding, async (context) =>
        handler({
          ...context,
          input: parseWithSchema<TInputSchema>(job.input, context.input),
        }),
      );
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

/** The settle hook a binding declared, if it declared one. */
export function getServiceJobSettledHandler(
  binding: ServiceJobBinding,
): ServiceJobSettledHandler<unknown> | undefined {
  return jobSettledHandlers.get(binding);
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

/** One piece of work this package queued that has not finished. */
export interface ServiceActiveJob {
  readonly id: string;
  readonly type: string;
  readonly status: "pending" | "processing";
  /** The payload as it was enqueued. */
  readonly data: unknown;
}

/** One piece of work this package queued, whatever became of it. */
export interface ServiceRecentJob extends Omit<ServiceActiveJob, "status"> {
  readonly status: "pending" | "processing" | "completed" | "failed";
  /** When it was queued. */
  readonly createdAt: number;
  /** When a worker picked it up, if one has. */
  readonly startedAt?: number | undefined;
  /** When it stopped, however it stopped. */
  readonly completedAt?: number | undefined;
  /** What the handler returned, for a job that finished. */
  readonly result?: unknown;
  readonly error?: string | undefined;
}

/** One job in a batch: a declaration this package registered, and its input. */
export interface ServiceBatchOperation<
  TDefinition extends AnyServiceJobDefinition = AnyServiceJobDefinition,
> {
  readonly definition: TDefinition;
  readonly input: z.input<TDefinition["input"]>;
}

export interface ServiceBatchOptions {
  /** Lower runs sooner; the queue's default when omitted. */
  readonly priority?: number | undefined;
  /**
   * The root the children are filed under. Named when coordination of the
   * work began elsewhere and the batch has to join it; otherwise the runtime
   * mints one.
   */
  readonly rootJobId?: string | undefined;
  /** A token the caller correlates progress events by. */
  readonly progressToken?: string | number | undefined;
  /** What the batch is working on, for progress reporting. */
  readonly operationTarget?: string | undefined;
}

export interface ServiceBatchStatus {
  readonly id: string;
  readonly status: "pending" | "processing" | "completed" | "failed";
  readonly total: number;
  readonly completed: number;
  readonly failed: number;
  readonly errors: readonly string[];
  readonly currentOperation?: string | undefined;
}

export interface ServiceBatchReference {
  readonly id: string;
  status(): Promise<ServiceBatchStatus | null>;
}

export interface ServiceJobs {
  /**
   * Work this package queued that is still pending or running.
   *
   * Scoped to this package's own jobs: an operator page shows what its own
   * pipeline has in flight, not the brain's whole queue.
   * Named consumer: @brains/content-pipeline.
   */
  active(): Promise<readonly ServiceActiveJob[]>;
  /**
   * Work this package queued lately, newest first, finished or not.
   *
   * Types are this package's own job names, as it declared them.
   *
   * An operator page shows what a package has been doing and not only what
   * it is doing now — the last build that succeeded, the one before it that
   * failed. Scoped to this package's own jobs, like `active`.
   * Named consumer: @brains/site-builder.
   */
  recent(options?: {
    readonly types?: readonly string[] | undefined;
    readonly limit?: number | undefined;
  }): Promise<readonly ServiceRecentJob[]>;
  /**
   * One piece of this package's queued work, by the id it was given.
   *
   * A projection that survives a restart holds ids, not definitions: it
   * recorded that a build was running and has to ask what became of it.
   * Answers null for a job this package did not queue.
   * Named consumer: @brains/site-builder.
   */
  find(jobId: string): Promise<ServiceRecentJob | null>;
  enqueue<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    input: z.input<TDefinition["input"]>,
  ): Promise<ServiceJobReference<TDefinition>>;
  status<TDefinition extends AnyServiceJobDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<ServiceJobStatus<z.output<TDefinition["output"]>> | null>;
  /**
   * Several jobs enqueued as one batch, so a sweep reports as one piece of
   * work rather than as each file. Every operation names a job this package
   * declared. Named consumer: @brains/directory-sync.
   */
  enqueueBatch(
    operations: readonly ServiceBatchOperation[],
    options?: ServiceBatchOptions,
  ): Promise<ServiceBatchReference>;
  /** How far a batch this package enqueued has got; null for one it did not. */
  batchStatus(batchId: string): Promise<ServiceBatchStatus | null>;
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
      /**
       * Create a type this package does not own, through the owner's route,
       * as the caller. See `RoutedCreate`.
       */
      readonly createRouted: RoutedCreate;
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
  /**
   * Work to do once this package's declarations are bound — its jobs among
   * them — and before the brain announces that every plugin has registered.
   * Setup runs before the runtime has read the `jobs` slot, so a setup that
   * enqueues finds its own job unregistered; this runs after.
   * Named consumer: @brains/directory-sync, which reconciles inherited git
   * work by queueing a batch as it comes up.
   */
  onRegistered(hook: () => void | Promise<void>): void;
}

/**
 * Which process a declared service is set up in. The scheduler is the one
 * brain process that owns background work; a worker runs jobs and nothing
 * else.
 */
export type ServiceRole = "scheduler" | "worker";

/**
 * Where the broker that owns this brain's git checkout listens, and where
 * the checkout is. Both undefined when the brain has no owner.
 */
export interface ServiceGitBroker {
  readonly socket: string | undefined;
  readonly checkout: string | undefined;
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
  /**
   * Where this template is named from.
   *
   * Defaults to the declaring package, which is right for a template the
   * package owns. A page section belongs to the site a brain composed
   * rather than to the package that turned its configuration into
   * templates, and a route names it by the namespace its author chose.
   * Named consumer: @brains/site-content.
   */
  readonly namespace?: string | undefined;
  /**
   * Who may read content stored under this template. Defaults to admin,
   * which is right for a package's own internal formatting and wrong for a
   * page section anyone visiting the site can see.
   * Named consumer: @brains/site-content.
   */
  readonly permission?: UserPermissionLevel | undefined;
  /**
   * How a value becomes text, when this template produces any.
   *
   * Optional because a template may exist only to render: a page section
   * that is drawn in a browser and never written to a file has nothing to
   * format. A template must do one or the other, which registration checks.
   */
  format?(context: { readonly value: z.output<TSchema> }): string;
  /**
   * The value this template's markdown came from.
   *
   * A template that only formats is a one-way street: content generated
   * under it is stored and can never be read back as the value it was
   * written from. A page section has to round-trip, because rendering it
   * again means parsing what is on disk.
   * Named consumer: @brains/site-content.
   */
  parse?(content: string): z.output<TSchema>;
  /**
   * How a value is drawn, when this template renders.
   *
   * A React component taking the parsed value as its props, mounted by the
   * site builder.
   *
   * The props are stored and serialized to the browser, so what the schema
   * produces has to be JSON. That is not spelled as a type constraint here:
   * a schema declared as `z.ZodType<SomeNamedType>` produces JSON at runtime
   * without being assignable to an index-signature type, and rejecting those
   * would refuse templates that are perfectly well formed. The runtime parses
   * the props through this schema before mounting, which is where a value
   * that cannot survive the trip actually fails.
   */
  readonly render?: ComponentType<z.output<TSchema>> | undefined;
  /** What this template is, where a console or a site lists it. */
  readonly description?: string | undefined;
  /**
   * The data source this template draws from, when it is not written by hand.
   *
   * A site route naming this template asks the runtime to fill it, and the
   * runtime asks the named source. Local to the package; the runtime scopes
   * it. Named consumer: @brains/knowledge-map, whose map is drawn from the
   * corpus rather than authored.
   */
  readonly dataSourceId?: string | undefined;
  /**
   * How saved copy is read, for a template whose data is fetched.
   *
   * Without this a data source and saved content are alternatives, and the
   * source wins. With it the saved content is parsed and laid over what the
   * source returned, so a live section can still carry an editor's words.
   * Named consumer: @brains/knowledge-map.
   */
  readonly overlayFormatter?: ContentFormatter<unknown> | undefined;
}

/**
 * A schema a template can render from must produce JSON: the parsed value is
 * stored, serialized to the browser, and handed to a React component as props.
 */
export type ServiceRenderSchema = TemplateDataSchema<JsonObject>;

/**
 * A publish provider a service supplies, named with the entity type it serves.
 *
 * The entity-side declaration needs no entityType — it is attached to one.
 * A service can serve any type its package declares, so it says which.
 */
export interface ServicePublishDeclaration extends EntityPublishDeclaration {
  readonly entityType: string;
}

/**
 * What the package is: its identity, what it is configured with, the types
 * it owns, and what it sets up before anything runs.
 *
 * The first of two arguments. `setup` sits here alone so the state it
 * returns is known before the behavior below is checked, which is what lets
 * those slots read `state` in whatever order they are written.
 */
interface ServiceDefinitionHeader<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
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
   * What the service holds while it runs, built once at registration.
   *
   * What this returns is the `state` every behavior slot reads. It sits in
   * the header, a separate argument, so the type is fixed before any of them
   * is checked — the order they are written in does not matter.
   */
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly lifecycle: ServiceLifecycle;
        /**
         * Which process this is. The runtime already withholds operator
         * bindings from a worker; a package whose own duties differ by
         * role — one that reconciles a checkout only where the scheduler
         * runs, and must never open admission from a worker — reads which
         * one it is in. Named consumer: @brains/directory-sync.
         */
        readonly role: ServiceRole;
        /**
         * The git broker's whereabouts, when the brain has one. Facts about
         * the process the runtime already holds; the package that talks to
         * the broker reads them here. Named consumer: @brains/directory-sync.
         */
        readonly gitBroker: ServiceGitBroker;
        /**
         * Where this brain keeps its data on disk. A package that mirrors
         * the records to files defaults to a directory under it.
         * Named consumer: @brains/directory-sync.
         */
        readonly dataDir: string;
        /**
         * The brain's records as a mirror keeps them: every type, read and
         * written as the file says, with the export ledger and the bulk
         * coordination a sweep runs under. The third admitted cross-type
         * write path, after `createRouted` and `operatorEntities`; here
         * the file is the record. Named consumer: @brains/directory-sync.
         */
        readonly entityMirror: EntityMirror;
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
         * Bookkeeping that is not an entity, kept between runs.
         *
         * A run in progress is not content, nobody browses it, and it should
         * not survive a rebuild of what it is about. The reaction context
         * offers this per call; it is here because the thing that writes
         * runs is built once, at registration.
         *
         * Named `runtimeState` because `state` is what `setup` returned,
         * which every slot below reads under that name. One word for two
         * different things, in the same declaration, is how a package ends up
         * writing durable notes into a value that vanishes with the process.
         * Interfaces have always called it this. Named consumers:
         * @brains/playbooks, @brains/email-workflows, @brains/atproto,
         * @brains/content-pipeline.
         */
        readonly runtimeState: <TValue>(
          options: RuntimeStateScopeOptions<TValue>,
        ) => IRuntimeStateStore<TValue>;
        /**
         * Put evidence to the model and get a verdict back in a shape you
         * named. Bounded on purpose — an instruction, the material, and a
         * schema — so what returns is a decision rather than prose the
         * package then has to parse. Named consumer: @brains/playbooks.
         */
        readonly judge: ServiceJudge;
        /**
         * How the brain presents itself to a network: who it is, whose it
         * is, what kind of profile it represents, what it offers publicly,
         * and whether it has a web channel to be reached on. Reads the
         * runtime already answers; a service that publishes the brain card
         * describes the brain, not itself. Named consumer: @brains/atproto.
         */
        readonly identity: {
          get(): BrainCharacter;
          getProfile(): AnchorProfile;
          getAppInfo(): Promise<AppInfo>;
        };
        readonly profileKinds: { getResolved(): ResolvedProfileSelection };
        readonly publicSkills: { list(): Promise<PublicSkill[]> };
        readonly plugins: Pick<IPluginsNamespace, "has">;
        readonly http: { isConfigured(): boolean };
        readonly siteUrl: string | undefined;
        /**
         * Where the brain's own pages are addressed, for a package that
         * renders them.
         *
         * `domain` is what the brain is called; the rest are the addresses
         * that follow from it — the preview host derived from the domain,
         * the local address a development runtime prefers, and whether it is
         * currently preferring it. A build writes absolute links, so it has
         * to agree with whatever else resolves one rather than re-deriving
         * them from three fields. Named consumer: @brains/site-builder.
         */
        readonly domain: string | undefined;
        readonly previewUrl: string | undefined;
        readonly localSiteUrl: string | undefined;
        readonly preferLocalUrls: boolean;
        /**
         * The view templates registered across the brain, and resolution of
         * a template's own content.
         *
         * A site build renders types it does not own: the package that owns
         * one registers how it looks, and the build asks what exists rather
         * than holding a list of its own. Named consumer:
         * @brains/site-builder.
         */
        readonly views: IViewsNamespace;
        readonly templates: ServiceTemplateReads;
        /**
         * Editing the brain's records on somebody's behalf, for a console
         * that edits every type and declares none. Every call takes the
         * caller and the runtime asks the entity-action policy from it.
         * Named consumer: @brains/studio.
         */
        readonly operatorEntities: OperatorEntityWrites;
        /**
         * What shape each entity type takes. Offered here as well as to
         * `ready`, because an editor reads shapes inside route handlers.
         * Named consumer: @brains/studio.
         */
        readonly entityShapes: ServiceEntityShapes;
        /**
         * The theme the brain is dressed in, for a console that inlines it
         * into the page it serves. Named consumer: @brains/studio.
         */
        readonly themeCSS: string;
        /**
         * Whether the runtime's dependencies are up, for a console that
         * reports on the brain it runs in. Named consumer: @brains/studio.
         */
        readonly readiness: () => Promise<RuntimeReadiness>;
        /**
         * How the brain labels its entity types, when it says. A console
         * shows a type the way the brain names it rather than by its
         * identifier. Named consumer: @brains/studio.
         */
        readonly entityDisplay: Record<string, EntityDisplayEntry> | undefined;
        /**
         * The other doors this caller should be shown.
         *
         * A console renders a strip of links to the rest of the brain. The
         * runtime knows which surfaces are mounted and what each requires;
         * the console says who is asking and where its own door is. The
         * interface families already ask this way, and a console served by a
         * service asks the same. Named consumer: @brains/dashboard.
         */
        readonly surfaces: (options: {
          readonly permissionLevel?: SurfacePermissionLevel | undefined;
          readonly hasActiveSession?: boolean | undefined;
          readonly selfHref?: string | undefined;
        }) => readonly ConsoleSurface[];
        /**
         * Announcing, for a service whose engine runs on its own schedule.
         * A timer has no caller to answer, and the subscription contexts
         * that do are not where a scheduler is built.
         * Named consumer: @brains/content-pipeline.
         */
        readonly messaging: ServicePublisher;
        /**
         * The permission check, for a service that acts on a caller's
         * behalf over types it does not own. A publish queue accepts a
         * request from a person; whether that person may publish that type
         * is the runtime's answer, not the queue's.
         * Named consumer: @brains/content-pipeline.
         */
        readonly permissions: IPermissionsNamespace;
        /**
         * Media another package resolves from an entity, for a service that
         * sends it onward. Named consumer: @brains/content-pipeline.
         */
        readonly attachments: IAttachmentsNamespace;
        /**
         * The declared jobs handle, held rather than passed per call: a
         * scheduler queues work on its own schedule, and an operator page
         * reads back what is in flight.
         * Named consumer: @brains/content-pipeline.
         */
        readonly jobs: ServiceJobs;
        /**
         * Publish state on entities other packages declared publishable.
         * See `ServicePublishingAccess`.
         */
        readonly publishing: ServicePublishingAccess;
        readonly logger: LoggerContract;
      }) => TState | Promise<TState>)
    | undefined;
}

/**
 * What the package does with what it set up.
 *
 * The second argument. Every slot here is checked against a state type the
 * header already fixed, so no slot has to be written after another one.
 */
interface ServiceDefinitionBehavior<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> {
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
        readonly config: z.output<TConfigSchema>;
        /**
         * What setup returned, for this instance.
         *
         * Routes used to be read from config alone so that tooling could
         * enumerate them without registering anything. No such tooling
         * exists: the production collector iterates registered plugins, and
         * every other caller is a test. What the rule did produce was a
         * package holding its client in a variable outside the plugin, which
         * the next instance overwrote — so two brains in one process answered
         * with whichever configuration set up last.
         */
        readonly state: TState;
        readonly jobs: ServiceJobs;
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
        /**
         * Where Studio put one of this package's workspaces, by the id the
         * package wrote, once the host has answered. A status another
         * package asks for over the bus says where to manage what it
         * reports. Named consumer: @brains/directory-sync.
         */
        readonly workspaceUrl: (workspaceId: string) => string | undefined;
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
  /**
   * Where this package's static build writes, for the runtime that serves it.
   *
   * A function of config alone, like `routes`: the host collects these once
   * after registration to know what it can serve, and the answer cannot
   * depend on state that does not exist yet. Named consumer:
   * @brains/site-builder.
   */
  readonly staticSite?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => StaticSiteOutput)
    | undefined;
  readonly dataSources?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnyDataSourceDeclaration[])
    | undefined;
  /**
   * How this package's own values are written down, and read back.
   *
   * Usually a map, because a package knows its own templates. A package
   * whose purpose is to turn a brain's configuration into page sections
   * cannot name them in advance, so it may declare a function of config
   * instead. Named consumer: @brains/site-content.
   */
  readonly templates?:
    | {
        readonly [K in keyof TTemplateSchemas]: ServiceTemplateDefinition<
          TTemplateSchemas[K]
        >;
      }
    | ((context: {
        readonly config: z.output<TConfigSchema>;
      }) => Record<string, ServiceTemplateDefinition<ServiceSchema>>)
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
  /**
   * Health checks this package reports, by name. A function of config and
   * state, because whether a check exists at all can depend on what was
   * configured. The runtime registers them once registration completes in
   * the scheduling role and releases them on shutdown; a worker reports
   * nothing. Named consumer: @brains/directory-sync.
   */
  readonly health?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => Readonly<Record<string, OperationalHealthProvider>>)
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

/**
 * Everything one package declares, as the runtime reads it: the header and
 * the behavior joined back together once the state type is known.
 */
type ServiceDefinitionCore<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionHeader<TConfigSchema, TState> &
  ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings
  >;

export type NormalizedServiceDefinitionInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionCore<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TAccountSettings
> & { readonly accountSettings: TAccountSettings };

export type ServiceDefinitionInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionCore<
  TConfigSchema,
  TState,
  TPromptSchemas,
  TTemplateSchemas,
  TAccountSettings
> &
  (TAccountSettings extends AnyAccountSettingsDefinition
    ? { readonly accountSettings: TAccountSettings }
    : { readonly accountSettings?: undefined });

/**
 * The header as an author writes it, with account settings attached.
 *
 * Account settings belong with identity rather than behavior: what a package
 * asks each person to configure is part of what it is, and the daemons and
 * workspaces that read those settings are checked against it.
 */
export type ServiceDefinitionHeaderInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionHeader<TConfigSchema, TState> &
  (TAccountSettings extends AnyAccountSettingsDefinition
    ? { readonly accountSettings: TAccountSettings }
    : { readonly accountSettings?: undefined });

export type { ServiceDefinitionHeader, ServiceDefinitionBehavior };
