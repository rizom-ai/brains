import {
  isPluginPackageDefinition,
  type PluginPackageConfigInput,
  type PluginPackageDefinition,
} from "@brains/plugins";

export interface ConfiguredPluginDefinition<
  TDefinition extends PluginPackageDefinition = PluginPackageDefinition,
> {
  readonly kind: "rizom-configured-plugin";
  readonly definition: TDefinition;
  readonly config: Readonly<Partial<PluginPackageConfigInput<TDefinition>>>;
}

export function use<TDefinition extends PluginPackageDefinition>(
  definition: TDefinition,
  config: Partial<PluginPackageConfigInput<TDefinition>> = {},
): ConfiguredPluginDefinition<TDefinition> {
  if (!isPluginPackageDefinition(definition)) {
    throw new Error(
      "use() expects a package definition returned by a @rizom/brain define helper",
    );
  }

  return Object.freeze({
    kind: "rizom-configured-plugin" as const,
    definition,
    config: Object.freeze({ ...config }),
  });
}

export function isConfiguredPluginDefinition(
  value: unknown,
): value is ConfiguredPluginDefinition {
  if (value === null || typeof value !== "object") return false;
  return (
    Reflect.get(value, "kind") === "rizom-configured-plugin" &&
    isPluginPackageDefinition(Reflect.get(value, "definition")) &&
    typeof Reflect.get(value, "config") === "object"
  );
}
