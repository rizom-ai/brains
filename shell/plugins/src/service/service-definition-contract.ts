import type {
  ComponentType,
  TemplateDataSchema,
  UserPermissionLevel,
} from "@brains/templates";
import type { JsonObject } from "@brains/contracts";
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
  EntityOf,
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

export interface ServiceEntityReader {
  get<TDefinition extends AnyEntityDefinition>(
    definition: TDefinition,
    id: string,
  ): Promise<EntityOf<TDefinition> | null>;
}

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

export interface ServiceTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

export interface ServiceJobHandlerContext<TInput> {
  readonly input: TInput;
  readonly entities: ServiceEntityReader;
  readonly messaging: ServiceMessagePublisher;
  readonly progress: ServiceProgressReporter;
  readonly signal: AbortSignal;
  readonly templates: ServiceTemplateFormatter;
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
  readonly confirmation?: string | undefined;
  readonly permission?: UserPermissionLevel | undefined;
  readonly sideEffects?: "none" | "writes" | "external" | undefined;
  execute(context: {
    readonly input: z.output<TInputSchema>;
    readonly signal: AbortSignal;
  }): z.input<TOutputSchema> | Promise<z.input<TOutputSchema>>;
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

export interface ServiceTemplateDefinition<TSchema extends ServiceSchema> {
  readonly schema: TSchema;
  readonly generation?: ServiceTemplateGenerationDefinition | undefined;
  format(context: { readonly value: z.output<TSchema> }): string;
}

/**
 * A view schema must produce JSON: its parsed value is stored, serialized to
 * the browser, and handed to a React component as props.
 */
export type ServiceViewSchema = TemplateDataSchema<JsonObject>;
export type ServiceViewSchemaMap = Record<string, ServiceViewSchema>;

export interface ServiceViewDefinition<TSchema extends ServiceViewSchema> {
  readonly schema: TSchema;
  readonly description?: string | undefined;
  readonly renderers: {
    /**
     * A React component receiving the schema-parsed value as props. Views are
     * mounted with createElement by the site builder, exactly like site
     * sections — the earlier string-returning form was mounted the same way,
     * which would have rendered its markup as an escaped text node.
     */
    readonly web: ComponentType<z.output<TSchema>>;
  };
}

/**
 * What the package is: its identity, its config, and what it sets up before
 * anything runs. The first of `defineServicePlugin`'s two arguments, so the
 * state `setup` returns is known before any behavior slot is checked, in
 * whatever order those are written.
 */
export interface ServiceDefinitionHeader<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
> {
  readonly id: string;
  readonly config: TConfigSchema;
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
  TViewSchemas extends ServiceViewSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
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
        >;
      })
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
  readonly tools?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
        readonly jobs: ServiceJobs;
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
  TViewSchemas extends ServiceViewSchemaMap,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
  TTemplateDefinitions extends ServiceTemplateShapeMap,
> = ServiceDefinitionHeader<TConfigSchema, TState> &
  ServiceDefinitionBehavior<
    TConfigSchema,
    TState,
    TPromptSchemas,
    TTemplateSchemas,
    TViewSchemas,
    TAccountSettings,
    TTemplateDefinitions
  > & { readonly accountSettings: TAccountSettings };

/**
 * The header as an author writes it. Account settings belong with identity
 * rather than behavior: what a package asks each person to configure is part
 * of what it is, and the operator slots that read them are checked against it.
 */
export type ServiceDefinitionHeaderInput<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
  TAccountSettings extends AnyAccountSettingsDefinition | undefined,
> = ServiceDefinitionHeader<TConfigSchema, TState> &
  (TAccountSettings extends AnyAccountSettingsDefinition
    ? { readonly accountSettings: TAccountSettings }
    : { readonly accountSettings?: undefined });
