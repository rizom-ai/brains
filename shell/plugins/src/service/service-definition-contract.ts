import type { UserPermissionLevel } from "@brains/templates";
import type { ToolContext } from "../interfaces";
import type { LoggerContract } from "@brains/utils/logger";
import type { AnySubscriptionDefinition } from "../contracts/subscription";
import type { AnyInterfaceRouteDefinition } from "../interface/route-contract";
import type { ChannelDeliveryProvider } from "../channel-registry";

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
export interface ServiceSeedDefinition {
  readonly entityType: string;
  readonly id: string;
  markdown(): string | Promise<string>;
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
    },
  ): z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
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
    context: EntityReactionContext & { readonly signal: AbortSignal },
  ): Promise<RecurringCheckResult>;
}

export interface ServiceLifecycle {
  onCleanup(cleanup: () => void | Promise<void>): void;
}

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
      }) => void | Promise<void>)
    | undefined;
  readonly subscriptions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => readonly AnySubscriptionDefinition[])
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
