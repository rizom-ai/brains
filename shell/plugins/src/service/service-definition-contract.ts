import type { ComponentType, UserPermissionLevel } from "@brains/templates";
import {
  defineBusContract as defineAnyBusContract,
  type BusContract,
  type BusResult,
  type JsonObject,
  type SdkErrorCode,
} from "@brains/contracts";
import type { ServiceContentGeneration } from "./content-generation-contract";
export type {
  ServiceContentGeneration,
  ServiceContentGenerationContext,
  ServiceContentGenerationItem,
  ServiceContentGenerationResult,
  ServiceContentGenerationSkipReason,
  ServiceContentGenerationTarget,
  ServiceContentGenerationTargetInput,
  ServiceEntityIdPath,
} from "./content-generation-contract";
import type { z } from "@brains/utils/zod";
import { parseWithSchema } from "@brains/utils/parse-schema";
import type {
  AnyEntityDefinition,
  ReadonlyInput,
  EntityMetadataInput,
  EntityOf,
  EntityReader,
  EntityVisibility,
} from "../entity/entity-definition-contract";
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

/**
 * Writes to the entity types the header's `entities` declares, as the
 * current caller: the tool caller inside a tool, the requester inside a
 * running job, and the package's own grant anywhere else. A write is held to
 * the type's action policy at that permission level; `update` and `delete`
 * refuse a record that changed after it was read, or that the caller cannot
 * see.
 */
export interface OwnedEntityWriter<TOwned extends AnyEntityDefinition> {
  /** Creates a record; one with that id at any visibility is refused. */
  create<TDefinition extends TOwned>(
    definition: TDefinition,
    input: NoInfer<{
      /** Omitted, the runtime picks one. */
      readonly id?: string | undefined;
      readonly content: string;
      readonly metadata: EntityMetadataInput<TDefinition["metadata"]>;
      readonly visibility?: EntityVisibility | undefined;
    }>,
  ): Promise<{ readonly id: string }>;
  /** Changes the content, the metadata or both of a record as it was read. */
  update<TDefinition extends TOwned>(
    definition: TDefinition,
    record: NoInfer<EntityOf<TDefinition>>,
    change: NoInfer<{
      readonly content?: string | undefined;
      readonly metadata?:
        EntityMetadataInput<TDefinition["metadata"]> | undefined;
    }>,
  ): Promise<void>;
  /** Deletes a record as it was read. */
  delete<TDefinition extends TOwned>(
    definition: TDefinition,
    record: NoInfer<EntityOf<TDefinition>>,
  ): Promise<void>;
}

/** What a slot reads and writes entities with: one `entities`, as the current caller. */
export type ServiceEntityAccess<TOwned extends AnyEntityDefinition> =
  EntityReader & OwnedEntityWriter<TOwned>;

export interface ServiceMessagePublisher {
  publish(input: {
    readonly topic: string;
    readonly data: object;
  }): Promise<void>;
}

/** How a package's bus contract travels: one owner answers, or every owner hears. */
export type ServiceBusDelivery = "request" | "command";

/**
 * Asking other packages over the bus, by the contract they answer, as this
 * package. Gathering every owner's answer stays inside the brain.
 */
export interface ServiceMessaging extends ServiceMessagePublisher {
  /**
   * Ask a request contract's owner: its answer, parsed by the contract;
   * `unavailable` when no package answers it; or `failed` with the failure
   * in its public form. A request the contract refuses throws.
   */
  request<TRequest extends z.ZodType, TResponse extends z.ZodType>(
    contract: BusContract<TRequest, TResponse, "request">,
    request: z.input<TRequest>,
  ): Promise<BusResult<z.output<TResponse>>>;
  /**
   * Send a command to every package that hears it; nobody answers. A command
   * the contract refuses throws.
   */
  command<TRequest extends z.ZodType>(
    contract: BusContract<TRequest, z.ZodType, "command">,
    request: z.input<TRequest>,
  ): Promise<void>;
}

/**
 * Declare a question one package answers (`request`) or a command every
 * package that hears it receives (`command`): its channel, what the sender
 * sends, and what the owner answers, `z.void()` for a command. The same
 * contract is the brain's own; gathering every owner's answer stays inside
 * the brain.
 */
export function defineBusContract<
  TRequest extends z.ZodType,
  TResponse extends z.ZodType,
  TDelivery extends ServiceBusDelivery,
>(definition: {
  readonly channel: string;
  readonly request: TRequest;
  readonly response: TResponse;
  readonly delivery: TDelivery;
}): BusContract<TRequest, TResponse, TDelivery> {
  const delivery: string = definition.delivery;
  if (delivery !== "request" && delivery !== "command") {
    throw new Error(
      `Bus contract "${definition.channel}" must be delivered as a "request" or a "command"`,
    );
  }
  return defineAnyBusContract(definition);
}

/**
 * What answering a contract is handed: the call's data, the parsed request
 * and who asked. The package's capabilities are the `subscriptions` slot's.
 */
export interface ServiceAnswerContext<TRequest> {
  readonly request: TRequest;
  /**
   * The package that asked, as the runtime knows it; nothing in the request
   * can name another. An answer authorizes by it and by what its contract
   * permits.
   */
  readonly sender: string;
}

/** A contract this package answers, as the `subscriptions` slot returns it. */
export interface ServiceSubscriptionBinding {
  readonly kind: "rizom-service-subscription-binding";
  readonly contract: BusContract<z.ZodType, z.ZodType>;
}

/**
 * What a tool returns or an answer gives: its schema's input, also accepted
 * read-only. Spelled through the schema's own input slot so that, with the
 * schema taken as a `const` parameter, a literal written inline keeps its
 * literal type, from a callback with parameters or without.
 */
export type ServiceSchemaValue<TSchema extends ServiceSchema> =
  TSchema["_zod"]["input"] | ReadonlyInput<z.input<TSchema>>;

/**
 * Answer a request contract, or hear a command: contract first. The handler
 * sees only a valid request, and its answer reaches the asker only when the
 * contract accepts it.
 */
export type ServiceAnswer = <
  const TRequest extends z.ZodType,
  const TResponse extends z.ZodType,
>(
  contract: BusContract<TRequest, TResponse, ServiceBusDelivery>,
  handler: (
    context: ServiceAnswerContext<z.output<TRequest>>,
  ) => ServiceSchemaValue<TResponse> | Promise<ServiceSchemaValue<TResponse>>,
) => ServiceSubscriptionBinding;

export interface ServiceJobProgress {
  readonly progress: number;
  readonly total?: number | undefined;
  readonly message?: string | undefined;
}

export interface ServiceProgressReporter {
  report(input: ServiceJobProgress): Promise<void>;
}

export interface ServiceTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

/**
 * What a job's handler is given: the call's own data. The package's
 * capabilities (`entities`, `messaging`, `templates`) are the `jobs`
 * slot's, which the handler closes over.
 */
export interface ServiceJobHandlerContext<TInput> {
  readonly input: TInput;
  readonly progress: ServiceProgressReporter;
  readonly signal: AbortSignal;
}

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
  /**
   * Why the last attempt failed, as its code's standard message: never the
   * message the failure was thrown with, which stays in the brain's logs.
   */
  readonly error?: string | undefined;
  /** The code of the last attempt's failure, when it failed. */
  readonly code?: SdkErrorCode | undefined;
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
   * What the person is asked to approve before the tool runs: the same
   * every time, or written from the parsed input when the act depends on it.
   */
  readonly confirmation?:
    string | ((input: z.output<TInputSchema>) => string) | undefined;
  readonly permission?: UserPermissionLevel | undefined;
  readonly sideEffects?: "none" | "writes" | "external" | undefined;
  execute(context: {
    readonly input: z.output<TInputSchema>;
    readonly signal: AbortSignal;
  }):
    | ServiceSchemaValue<TOutputSchema>
    | Promise<ServiceSchemaValue<TOutputSchema>>;
}

export type AnyServiceToolDefinition = ServiceToolDefinition<
  string,
  ServiceInputSchema,
  ServiceSchema
>;

export function defineTool<
  const TName extends string,
  TInputSchema extends ServiceInputSchema,
  const TOutputSchema extends ServiceSchema,
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

export interface ServiceLifecycle {
  onCleanup(cleanup: () => void | Promise<void>): void;
}

/** What a package keeps under one runtime-state namespace, and its schema. */
export interface ServiceRuntimeStateOptions<TValue, TInput = TValue> {
  /** Local to the package; the runtime qualifies it by the owning package. */
  readonly namespace: string;
  /** Validates every write and parses every read. */
  readonly schema: z.ZodType<TValue, TInput>;
}

/** One stored value, as a listing returns it. */
export interface ServiceRuntimeStateRecord<TValue> {
  readonly key: string;
  readonly value: TValue;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Bookkeeping that is not an entity, kept between runs: a cursor, a count, a
 * claim. Writes take the schema's input and are stored as written; every read
 * parses what is stored, so a transform runs at the read, never twice.
 */
export interface ServiceRuntimeState<TValue, TInput = TValue> {
  get(key: string): Promise<TValue | null>;
  has(key: string): Promise<boolean>;
  set(key: string, value: TInput): Promise<void>;
  /** Writes only when the key is absent; true when it wrote. */
  setIfNotExists(key: string, value: TInput): Promise<boolean>;
  /** Replaces the value only while it still reads as `expected`. */
  compareAndSet(key: string, expected: TValue, value: TInput): Promise<boolean>;
  delete(key: string): Promise<boolean>;
  /** In key order, `afterKey` exclusive, at most `limit` (1–1000) records. */
  list(options?: {
    readonly keyPrefix?: string | undefined;
    readonly afterKey?: string | undefined;
    readonly limit?: number | undefined;
  }): Promise<readonly ServiceRuntimeStateRecord<TValue>[]>;
  /** Removes every record, or those under a literal key prefix; the count. */
  clear(options?: { readonly keyPrefix?: string | undefined }): Promise<number>;
}

/** What `setup` is given once, when the package registers. */
export interface ServiceSetupContext<TConfig> {
  readonly config: TConfig;
  readonly lifecycle: ServiceLifecycle;
  /**
   * A runtime-state store for this package. Named `runtimeState` because
   * `state` is what `setup` returns. Two packages naming the same namespace
   * never share a record.
   */
  readonly runtimeState: <TValue, TInput = TValue>(
    options: ServiceRuntimeStateOptions<TValue, TInput>,
  ) => ServiceRuntimeState<TValue, TInput>;
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

export interface ServiceTemplateGenerationDefinition {
  readonly prompt: string;
  readonly useKnowledgeContext?: boolean | undefined;
}

export type ServiceTemplateShapeMap = Record<
  string,
  {
    readonly schema: ServiceSchema;
    readonly generation?: ServiceTemplateGenerationDefinition | undefined;
  }
>;
type GenerationTemplateNames<TTemplates extends ServiceTemplateShapeMap> =
  Extract<
    {
      [K in keyof TTemplates]: TTemplates[K] extends {
        readonly generation: ServiceTemplateGenerationDefinition;
      }
        ? K
        : never;
    }[keyof TTemplates],
    string
  >;

/**
 * One declaration per template, whatever it can do: it formats a value as
 * text, renders it, or both, and registration refuses one that does neither.
 */
export interface ServiceTemplateDefinition<TSchema extends ServiceSchema> {
  readonly schema: TSchema;
  /** What the template is, where a console or a site lists it. */
  readonly description?: string | undefined;
  /** Content the brain writes under this template; it must format it too. */
  readonly generation?: ServiceTemplateGenerationDefinition | undefined;
  /** How a value becomes text, when the template produces any. */
  readonly format?:
    ((context: { readonly value: z.output<TSchema> }) => string) | undefined;
  /** How a value is drawn, when the template renders. */
  readonly renderers?:
    | {
        /**
         * A React component receiving the schema-parsed value as props,
         * mounted by the site builder exactly like a site section. The value
         * is stored and serialized to the browser, so the schema must
         * produce JSON.
         */
        readonly web: ComponentType<z.output<TSchema>>;
      }
    | undefined;
}

/**
 * A template renders only a schema that produces JSON: its parsed value is
 * stored, serialized to the browser, and handed to a component as props.
 */
export type ServiceTemplateRenderCheck<TSchema extends ServiceSchema> =
  z.output<TSchema> extends JsonObject
    ? unknown
    : { readonly renderers?: undefined };

/**
 * What the package is: its identity, its config, and what it sets up before
 * anything runs. The first of `defineServicePlugin`'s two arguments, so the
 * state `setup` returns is known before any behavior slot is checked, in
 * whatever order those are written.
 */
export interface ServiceDefinitionHeader<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TEntities extends readonly AnyEntityDefinition[] = readonly [],
> {
  readonly id: string;
  readonly config: TConfigSchema;
  /**
   * The entity types this package owns: each is installed with the package,
   * and they are the only types its `entities` may write.
   */
  readonly entities?: TEntities | undefined;
  /** Builds the `state` every behavior slot reads, once, at registration. */
  readonly setup?:
    | ((
        context: ServiceSetupContext<z.output<TConfigSchema>>,
      ) => TState | Promise<TState>)
    | undefined;
}

/** What the package does with what it set up: the second argument. */
export interface ServiceDefinitionBehavior<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TOwned extends AnyEntityDefinition = never,
> {
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
    | (TTemplateDefinitions & {
        readonly [K in keyof TTemplateSchemas]: ServiceTemplateDefinition<
          TTemplateSchemas[K]
        > &
          ServiceTemplateRenderCheck<TTemplateSchemas[K]>;
      })
    | undefined;
  readonly jobs?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /** Reads and writes as the requester of the job that is running. */
        readonly entities: ServiceEntityAccess<TOwned>;
        readonly messaging: ServiceMessaging;
        readonly templates: ServiceTemplateFormatter;
      }) => readonly ServiceJobBinding[])
    | undefined;
  /**
   * The contracts this package answers, registered with the package and
   * released when it shuts down.
   */
  readonly subscriptions?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /**
         * Inside an answer, reads and writes as the package: the bus carries
         * the package that asked, not a person.
         */
        readonly entities: ServiceEntityAccess<TOwned>;
        readonly jobs: ServiceJobs;
        readonly messaging: ServiceMessaging;
        readonly answer: ServiceAnswer;
      }) => readonly ServiceSubscriptionBinding[])
    | undefined;
  readonly tools?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        /** Reads and writes as the caller of the tool that is running. */
        readonly entities: ServiceEntityAccess<TOwned>;
        readonly jobs: ServiceJobs;
        readonly messaging: ServiceMessaging;
        readonly templates: ServiceTemplateFormatter;
        readonly content: ServiceContentGeneration<
          GenerationTemplateNames<NoInfer<TTemplateDefinitions>>
        >;
      }) => readonly AnyServiceToolDefinition[])
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

/** Everything one package declares, as the runtime reads it: both halves joined. */
export type NormalizedServiceDefinitionInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TPromptSchemas extends ServiceSchemaMap,
  TTemplateSchemas extends ServiceSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
  TEntities extends readonly AnyEntityDefinition[],
> = Omit<
  ServiceDefinitionHeader<TConfigSchema, TState, TEntities>,
  "entities"
> &
  ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TAccountSettings,
    TTemplateDefinitions,
    TEntities[number]
  > & {
    readonly accountSettings: TAccountSettings;
    /** The header's owned types, copied when the package is defined. */
    readonly entities: readonly TEntities[number][];
  };

/**
 * The header as an author writes it. Account settings belong with identity
 * rather than behavior: what a package asks each person to configure is part
 * of what it is, and the operator slots that read them are checked against it.
 */
export type ServiceDefinitionHeaderInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TEntities extends readonly AnyEntityDefinition[] = readonly [],
> = ServiceDefinitionHeader<TConfigSchema, TState, TEntities> &
  (TAccountSettings extends AnyAccountSettingsDefinition
    ? { readonly accountSettings: TAccountSettings }
    : { readonly accountSettings?: undefined });
