import {
  isConfiguredPluginDefinition,
  type ConfiguredPluginDefinition,
} from "./configured-plugin";
import type { BrainDefinition } from "./contracts/brain-definition";

export function isDeclarativeBrainDefinition(
  value: unknown,
): value is BrainDefinition {
  if (value === null || typeof value !== "object") return false;
  const plugins: unknown = Reflect.get(value, "plugins");
  return (
    typeof Reflect.get(value, "name") === "string" &&
    Array.isArray(plugins) &&
    plugins.every((plugin: unknown): plugin is ConfiguredPluginDefinition =>
      isConfiguredPluginDefinition(plugin),
    )
  );
}
