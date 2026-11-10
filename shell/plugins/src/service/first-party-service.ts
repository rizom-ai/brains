import type { z } from "@brains/utils/zod";
import type { Tool } from "@brains/mcp-service";
import type { ProgressReporter } from "@brains/utils/progress";
import type { PluginPackageDefinition } from "../package-definition";
import type {
  FirstPartySlot,
  FirstPartySlotContext,
} from "../interface/first-party-interface";

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
