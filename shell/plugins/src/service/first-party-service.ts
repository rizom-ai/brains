import { z } from "@brains/utils/zod";
import type { Logger } from "@brains/utils/logger";
import type { JobHandler } from "@brains/job-queue";
import type { Tool } from "@brains/mcp-service";
import type { ProgressReporter } from "@brains/utils/progress";
import type { StaticSiteOutput } from "../internal/http-host";
import type { PluginPackageDefinition } from "../package-definition";
import type {
  FirstPartySlot,
  FirstPartySlotContext,
} from "../internal/first-party-slot";

/**
 * Internal, first-party only: what a first-party service converted from a
 * class declares beside its public definition, as plain data and functions,
 * through the same wrappers a first-party interface uses (`withTools`). Each
 * slot is given the parsed config and the state setup returned, with the
 * service runtime attached (`serviceRuntime(context)`).
 *
 * Tracked in docs/legacy-code-inventory.json (first-party-service-runtime).
 */

/** What the wrappers have added to a service definition. */
export interface FirstPartyServiceDeclarations {
  readonly tools?: FirstPartySlot<readonly Tool[]> | undefined;
  readonly jobHandlers?:
    FirstPartySlot<readonly FirstPartyJobHandler[]> | undefined;
  /** Where it writes the site the runtime's HTTP host serves. */
  readonly staticSiteOutput?: StaticSiteOutputSlot | undefined;
}

/**
 * Where a site builder writes, as the runtime keeps it: a method, so a slot
 * declared over its own config is one.
 */
export interface StaticSiteOutputSlot {
  run(context: { readonly config: unknown }): StaticSiteOutput;
}

/** What one run of a job its class handled is given: its call's data. */
export interface FirstPartyJobCall<TInput> {
  /** The job's data, parsed by the job's schema. */
  readonly input: TInput;
  readonly jobId: string;
  readonly progress: ProgressReporter;
  readonly signal: AbortSignal;
}

/**
 * A job its class handled, as plain data and functions: registered under
 * the type its class registered (local to the plugin, as the class named
 * it), reading the data the class queued, which other packages queue by
 * type and a queue may hold at an upgrade, with the class's schema, and
 * running as the package, as the class's handler ran.
 */
export interface FirstPartyJobHandler<TInput = unknown> {
  readonly type: string;
  readonly input: z.ZodType<TInput, unknown>;
  /** Per-type execution deadline; unset, the worker's default. */
  readonly executionTimeoutMs?: number | undefined;
  /** At most one job of this type runs at a time, across every worker. */
  readonly exclusive?: boolean | undefined;
  /** What a log line says of the data; unset, the data as written. */
  summarize?(input: TInput): Record<string, unknown>;
  process(call: FirstPartyJobCall<TInput>): Promise<unknown>;
}

/**
 * A job its class handled, typed by its schema: the input its `process` and
 * `summarize` read is what the schema parses.
 */
export function firstPartyJobHandler<TInput>(
  handler: FirstPartyJobHandler<TInput>,
): FirstPartyJobHandler {
  return handler;
}

/** What a job's data says in a log line when its job names nothing else. */
const logDataSchema = z.record(z.string(), z.unknown());

/**
 * The queue's handler for a job its class handled, as its class's handler
 * ran: the data checked by its schema and logged as the class's handler
 * base logged it (a warning for refused data, its summary when it parses,
 * an error when a run fails), each run inside `run`.
 */
export function firstPartyJobHandlerOf(
  job: FirstPartyJobHandler,
  options: {
    readonly logger: Logger;
    readonly run: (process: () => Promise<unknown>) => Promise<unknown>;
  },
): JobHandler {
  const { logger } = options;
  const summarize = (data: unknown): Record<string, unknown> => {
    if (job.summarize) return job.summarize(data);
    const record = logDataSchema.safeParse(data);
    return record.success ? record.data : {};
  };
  return {
    ...(job.executionTimeoutMs !== undefined && {
      executionTimeoutMs: job.executionTimeoutMs,
    }),
    ...(job.exclusive !== undefined && { exclusive: job.exclusive }),
    validateAndParse(data: unknown): unknown {
      const parsed = job.input.safeParse(data);
      if (!parsed.success) {
        logger.warn(`Invalid ${job.type} job data`, {
          data,
          validationError: parsed.error.issues,
        });
        return null;
      }
      logger.debug(`${job.type} job data validation successful`, {
        data: summarize(parsed.data),
      });
      return parsed.data;
    },
    process: (data, jobId, progress, signal): Promise<unknown> =>
      options.run(() => job.process({ input: data, jobId, progress, signal })),
    onError: async (error, data, jobId): Promise<void> => {
      logger.error(`${job.type} job error handler triggered`, {
        jobId,
        errorMessage: error.message,
        errorStack: error.stack,
        data: summarize(data),
      });
    },
  };
}

export const noFirstPartyServiceDeclarations: FirstPartyServiceDeclarations =
  Object.freeze({});

type ServicePackage<TConfigSchema extends z.ZodType<object, object>> =
  PluginPackageDefinition<TConfigSchema, "service">;

/** How each service package is rebuilt with more first-party declarations. */
const rebuilders = new WeakMap<
  PluginPackageDefinition,
  {
    readonly declarations: FirstPartyServiceDeclarations;
    rebuild(
      declarations: FirstPartyServiceDeclarations,
    ): PluginPackageDefinition;
  }
>();

/** Called by defineServicePlugin: how its result is rebuilt by a wrapper. */
export function registerServiceRebuilder(
  definition: PluginPackageDefinition,
  declarations: FirstPartyServiceDeclarations,
  rebuild: (
    declarations: FirstPartyServiceDeclarations,
  ) => PluginPackageDefinition,
): void {
  rebuilders.set(definition, { declarations, rebuild });
}

/** Whether a definition is a service's, which the wrappers then rebuild. */
export function isServicePackage<
  TConfigSchema extends z.ZodType<object, object>,
>(
  definition: PluginPackageDefinition<TConfigSchema>,
): definition is ServicePackage<TConfigSchema> {
  return definition.family === "service";
}

/** A service definition with one more declaration added by `wrapper`. */
export function rebuildServiceWith<
  TConfigSchema extends z.ZodType<object, object>,
>(
  definition: ServicePackage<TConfigSchema>,
  wrapper: string,
  add: (
    declarations: FirstPartyServiceDeclarations,
  ) => FirstPartyServiceDeclarations,
): ServicePackage<TConfigSchema> {
  const entry = rebuilders.get(definition);
  if (!entry) {
    throw new Error(
      `${wrapper} takes a definition defineServicePlugin returned; "${definition.id}" is not one`,
    );
  }
  const rebuilt = entry.rebuild(add(entry.declarations));
  // The rebuilt definition is the same package: same family, id and config.
  if (!isSameService(rebuilt, definition.config)) {
    throw new Error(`Service "${definition.id}" did not rebuild as itself`);
  }
  return rebuilt;
}

function isSameService<TConfigSchema extends z.ZodType<object, object>>(
  definition: PluginPackageDefinition,
  config: TConfigSchema,
): definition is ServicePackage<TConfigSchema> {
  return definition.family === "service" && definition.config === config;
}

/** The tools a service's class registered, added once. */
export function withServiceTools<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object,
>(
  definition: ServicePackage<TConfigSchema>,
  tools: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly Tool[],
): ServicePackage<TConfigSchema> {
  return rebuildServiceWith(definition, "withTools", (declarations) => {
    if (declarations.tools) {
      throw new Error(
        `Service "${definition.id}" declares its tools more than once`,
      );
    }
    return { ...declarations, tools: { run: tools } };
  });
}

/** The jobs a service's class handled, added once. */
export function withJobHandlers<
  TConfigSchema extends z.ZodType<object, object>,
  TState extends object = Record<never, never>,
>(
  definition: ServicePackage<TConfigSchema>,
  jobHandlers: (
    context: FirstPartySlotContext<z.output<TConfigSchema>, TState>,
  ) => readonly FirstPartyJobHandler[],
): ServicePackage<TConfigSchema> {
  return rebuildServiceWith(definition, "withJobHandlers", (declarations) => {
    if (declarations.jobHandlers) {
      throw new Error(
        `Service "${definition.id}" declares its job handlers more than once`,
      );
    }
    return { ...declarations, jobHandlers: { run: jobHandlers } };
  });
}

/**
 * Where a site builder's class wrote the site the runtime's HTTP host
 * serves, from the parsed config, added once. The host reads it once, when
 * it starts.
 */
export function withStaticSiteOutput<
  TConfigSchema extends z.ZodType<object, object>,
>(
  definition: ServicePackage<TConfigSchema>,
  output: (context: {
    readonly config: z.output<TConfigSchema>;
  }) => StaticSiteOutput,
): ServicePackage<TConfigSchema> {
  return rebuildServiceWith(
    definition,
    "withStaticSiteOutput",
    (declarations) => {
      if (declarations.staticSiteOutput) {
        throw new Error(
          `Service "${definition.id}" declares its static site output more than once`,
        );
      }
      return { ...declarations, staticSiteOutput: { run: output } };
    },
  );
}
