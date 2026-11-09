import type { Plugin } from "./interfaces";
import { PluginConfigValidationError } from "./config";
import { z } from "@brains/utils/zod";

export type PluginPackageFamily =
  "entity" | "service" | "interface" | "message-interface";

// Total map so adding a family is a compile error here, and the deliberate
// collapse of message interfaces onto the interface plugin type is explicit.
// A service package also installs an entity plugin for each type it owns.
const FAMILY_PLUGIN_TYPES: Record<
  PluginPackageFamily,
  readonly Plugin["type"][]
> = {
  entity: ["entity"],
  service: ["service", "entity"],
  interface: ["interface"],
  "message-interface": ["interface"],
};

export type AnyPluginConfigSchema = z.ZodType<object, object>;

/** Public, metadata-free description returned by declarative authoring helpers. */
export interface PluginPackageDefinition<
  TConfigSchema extends AnyPluginConfigSchema = AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily = PluginPackageFamily,
> {
  readonly kind: "rizom-plugin-package";
  readonly family: TFamily;
  readonly id: string;
  readonly config: TConfigSchema;
}

export type PluginPackageConfigInput<
  TDefinition extends PluginPackageDefinition,
> = z.input<TDefinition["config"]>;

export type PluginPackageConfig<TDefinition extends PluginPackageDefinition> =
  z.output<TDefinition["config"]>;

export interface InstalledPluginPackageMetadata {
  readonly name: string;
  readonly version: string;
}

export interface PluginPackageInstantiationContext<TConfig extends object> {
  readonly config: TConfig;
  readonly package: InstalledPluginPackageMetadata;
  scope(localId: string): string;
  /** The plugin id a first-party package keeps from its class. */
  readonly pluginId?: string | undefined;
  /** The plugins a first-party service's class declared it depends on. */
  readonly dependencies?: readonly string[] | undefined;
}

/**
 * How a composer instantiates a definition. Internal: only the first-party
 * composer names these, and package source never does.
 */
export interface PluginPackageInstantiationOptions {
  /**
   * The plugin id a converted first-party entity, service or interface
   * package keeps from its class, with every name derived from it (templates, data
   * sources, jobs, channels). The package still owns its state and channels
   * by name. A service that owns a type installs it under the type itself,
   * as an entity plugin class was named after its type.
   */
  readonly pluginId?: string | undefined;
  /**
   * The plugins a converted first-party service's class declared it depends
   * on, which register before it and without which it does not start.
   */
  readonly dependencies?: readonly string[] | undefined;
}

type PluginPackageRuntimeFactory<TConfig extends object> = (
  context: PluginPackageInstantiationContext<TConfig>,
) => Plugin | readonly Plugin[];

const runtimeFactory = Symbol.for("rizom.plugin-package.runtime-factory");
const installedMetadata = new WeakMap<
  PluginPackageDefinition,
  InstalledPluginPackageMetadata
>();
/** Every plugin a definition created, so a reader can tell it from a class. */
const definitionPlugins = new WeakSet<Plugin>();

/**
 * Whether a definition created this plugin rather than a class constructing
 * it: such a plugin declares what it serves, its routes included, only once
 * it registers, which is when the shell collects them.
 */
export function isPackageDefinitionPlugin(plugin: Plugin): boolean {
  return definitionPlugins.has(plugin);
}

interface RuntimePluginPackageDefinition<
  TConfigSchema extends AnyPluginConfigSchema = AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily = PluginPackageFamily,
> extends PluginPackageDefinition<TConfigSchema, TFamily> {
  readonly [runtimeFactory]: PluginPackageRuntimeFactory<
    z.output<TConfigSchema>
  >;
}

export interface CreatePluginPackageDefinitionInput<
  TConfigSchema extends AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily = PluginPackageFamily,
  TPublic extends object = Record<never, never>,
> {
  readonly family: TFamily;
  readonly id: string;
  readonly config: TConfigSchema;
  readonly public?: TPublic | undefined;
  readonly instantiate: PluginPackageRuntimeFactory<z.output<TConfigSchema>>;
}

/**
 * Pass-through schema for config already parsed by the package loader.
 * Declarative plugin adapters hand BasePlugin a schema, but their config
 * was validated once by createPluginPackageDefinition — re-parsing would
 * re-run transforms, so this only asserts the object shape.
 */
export function identityConfigSchema<TConfig extends object>(): z.ZodType<
  TConfig,
  unknown
> {
  return z.custom<TConfig>(
    (value) => value !== null && typeof value === "object",
  );
}

export function assertIdentifier(value: string, label: string): void {
  if (!/^[a-z][a-z0-9-]*$/u.test(value)) {
    throw new Error(
      `${label} must start with a lowercase letter and contain only lowercase letters, numbers, and hyphens`,
    );
  }
}

/** Internal normalization primitive used by the family-specific define helpers. */
export function createPluginPackageDefinition<
  TConfigSchema extends AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily,
  TPublic extends object,
>(
  input: CreatePluginPackageDefinitionInput<TConfigSchema, TFamily, TPublic> & {
    readonly public: TPublic;
  },
): PluginPackageDefinition<TConfigSchema, TFamily> & Readonly<TPublic>;
export function createPluginPackageDefinition<
  TConfigSchema extends AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily,
>(
  input: CreatePluginPackageDefinitionInput<TConfigSchema, TFamily>,
): PluginPackageDefinition<TConfigSchema, TFamily>;
export function createPluginPackageDefinition<
  TConfigSchema extends AnyPluginConfigSchema,
  TFamily extends PluginPackageFamily,
>(
  input: CreatePluginPackageDefinitionInput<TConfigSchema, TFamily, object>,
): PluginPackageDefinition<TConfigSchema, TFamily> {
  assertIdentifier(input.id, "Plugin definition id");

  const core: PluginPackageDefinition<TConfigSchema, TFamily> = {
    kind: "rizom-plugin-package",
    family: input.family,
    id: input.id,
    config: input.config,
  };
  const definition: PluginPackageDefinition<TConfigSchema, TFamily> =
    Object.assign({}, input.public, core);
  Object.defineProperty(definition, runtimeFactory, {
    configurable: false,
    enumerable: false,
    value: input.instantiate,
    writable: false,
  });
  return Object.freeze(definition);
}

export function isPluginPackageDefinition(
  value: unknown,
): value is PluginPackageDefinition {
  // Reflect.get rather than a Partial<> assertion: the members are read off an
  // unvalidated value, and `config` is a zod schema — a class instance, so a
  // plain-record check would wrongly reject it.
  if (value === null || typeof value !== "object") return false;
  const config: unknown = Reflect.get(value, "config");
  return (
    Reflect.get(value, "kind") === "rizom-plugin-package" &&
    typeof Reflect.get(value, "id") === "string" &&
    typeof Reflect.get(value, "family") === "string" &&
    config !== null &&
    typeof config === "object" &&
    typeof Reflect.get(config, "safeParse") === "function" &&
    typeof Reflect.get(value, runtimeFactory) === "function"
  );
}

/** The brand is a symbol key the declared type does not carry; check it. */
function hasRuntimeFactory(
  definition: PluginPackageDefinition,
): definition is RuntimePluginPackageDefinition {
  return typeof Reflect.get(definition, runtimeFactory) === "function";
}

function runtimeDefinition(
  definition: PluginPackageDefinition,
): RuntimePluginPackageDefinition {
  if (!hasRuntimeFactory(definition)) {
    throw new Error(
      `Plugin definition "${definition.id}" has no runtime adapter; export the result of a @rizom/brain define helper instead of a hand-written object`,
    );
  }
  return definition;
}

/**
 * The plugins a definition declared inside another package creates, under
 * that package's parsed config, metadata and scope: a package that declares
 * several definitions instantiates each as its own.
 */
export function instantiateWithinPackage<TConfig extends object>(
  definition: PluginPackageDefinition,
  context: PluginPackageInstantiationContext<TConfig>,
): Plugin[] {
  const created = runtimeDefinition(definition)[runtimeFactory](context);
  return isSeveral(created) ? [...created] : [created];
}

// `Array.isArray` alone leaves the readonly array in the else branch.
function isSeveral(
  created: Plugin | readonly Plugin[],
): created is readonly Plugin[] {
  return Array.isArray(created);
}

export function bindPluginPackageMetadata(
  definition: PluginPackageDefinition,
  metadata: InstalledPluginPackageMetadata,
): void {
  if (!metadata.name || !metadata.version) {
    throw new Error(
      `Installed package metadata is incomplete for plugin definition "${definition.id}"`,
    );
  }

  const existing = installedMetadata.get(definition);
  if (
    existing &&
    (existing.name !== metadata.name || existing.version !== metadata.version)
  ) {
    throw new Error(
      `Plugin definition "${definition.id}" was loaded as both "${existing.name}@${existing.version}" and "${metadata.name}@${metadata.version}"`,
    );
  }
  installedMetadata.set(definition, Object.freeze({ ...metadata }));
}

export function getPluginPackageMetadata(
  definition: PluginPackageDefinition,
): InstalledPluginPackageMetadata | undefined {
  return installedMetadata.get(definition);
}

export function instantiatePluginPackageDefinition(
  definition: PluginPackageDefinition,
  rawConfig: unknown,
  metadata: InstalledPluginPackageMetadata,
  options: PluginPackageInstantiationOptions = {},
): Plugin[] {
  const { pluginId, dependencies } = options;
  if (dependencies !== undefined && definition.family !== "service") {
    throw new Error(
      `Plugin definition "${definition.id}" is not a service package; only a service keeps the dependencies its class declared`,
    );
  }
  if (pluginId !== undefined) {
    assertIdentifier(pluginId, "Legacy plugin id");
  }
  if (!metadata.name || !metadata.version) {
    throw new Error(
      `Installed package metadata is incomplete for plugin definition "${definition.id}"`,
    );
  }

  const parsed = definition.config.safeParse(rawConfig);
  if (!parsed.success) {
    throw PluginConfigValidationError.fromZod(
      `${metadata.name}:${definition.id}`,
      parsed.error,
      rawConfig,
    );
  }

  const created = runtimeDefinition(definition)[runtimeFactory]({
    config: parsed.data,
    package: metadata,
    scope(localId) {
      assertIdentifier(localId, "Local plugin id");
      return `${metadata.name}:${localId}`;
    },
    ...(pluginId !== undefined && { pluginId }),
    ...(dependencies !== undefined && { dependencies }),
  });
  const plugins = isSeveral(created) ? [...created] : [created];
  const expectedTypes = FAMILY_PLUGIN_TYPES[definition.family];

  for (const plugin of plugins) {
    if (
      plugin.packageName !== metadata.name ||
      plugin.version !== metadata.version
    ) {
      throw new Error(
        `Plugin definition "${metadata.name}:${definition.id}" produced metadata that does not match its installed package`,
      );
    }
    if (!expectedTypes.includes(plugin.type)) {
      throw new Error(
        `Plugin definition "${metadata.name}:${definition.id}" declared family "${definition.family}" but produced plugin type "${plugin.type}"`,
      );
    }
  }
  for (const plugin of plugins) definitionPlugins.add(plugin);
  return plugins;
}
