import type { z } from "@brains/utils/zod";
import type { Tool } from "@brains/mcp-service";
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
