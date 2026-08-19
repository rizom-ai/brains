import type { UserPermissionLevel } from "@brains/templates";
import type { LoggerContract } from "@brains/utils/logger";
import type { z } from "@brains/utils/zod";
import type {
  AnyEntityDefinition,
  EntityPublishDeclaration,
  ProjectionDefinition,
} from "../entity/entity-definition-contract";
import type { JobHandlerContext } from "../job/job-context-contract";
import type { AnyAccountSettingsDefinition } from "../operator/account-settings-definition-contract";
import type {
  AnyCmsWorkspaceDefinition,
  AnyDashboardWidgetDefinition,
  BoundCmsWorkspace,
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

export type ServiceEvalHandler = (input: unknown) => Promise<unknown>;

export interface ServiceTemplateFormatter {
  format<TValue>(name: string, value: TValue): string;
}

export type ServiceJobHandlerContext<TInput> = JobHandlerContext<TInput>;

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
  readonly projections?: readonly ProjectionDefinition[] | undefined;
  readonly setup?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly lifecycle: ServiceLifecycle;
      }) => TState | Promise<TState>)
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
  readonly evals?:
    | ((context: {
        readonly config: z.output<TConfigSchema>;
        readonly state: TState;
      }) => Record<string, ServiceEvalHandler>)
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
  readonly cmsWorkspaces?:
    | ((
        context: OperatorBindingContext<
          z.output<TConfigSchema>,
          TState,
          TAccountSettings
        >,
      ) => readonly BoundCmsWorkspace<
        AnyCmsWorkspaceDefinition,
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
