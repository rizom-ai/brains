import {
  isPluginPackageDefinition,
  type PluginPackageConfigInput,
  type PluginPackageDefinition,
} from "@brains/plugins";
import type { BrainDefinition as DeclarativeBrainDefinition } from "./contracts/brain-definition";

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
  const candidate = value as Partial<ConfiguredPluginDefinition>;
  return (
    candidate.kind === "rizom-configured-plugin" &&
    isPluginPackageDefinition(candidate.definition) &&
    typeof candidate.config === "object"
  );
}

export function isDeclarativeBrainDefinition(
  value: unknown,
): value is DeclarativeBrainDefinition {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<DeclarativeBrainDefinition>;
  return (
    typeof candidate.name === "string" &&
    Array.isArray(candidate.plugins) &&
    candidate.plugins.every(isConfiguredPluginDefinition)
  );
}
