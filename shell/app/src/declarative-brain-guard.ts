import {
  isConfiguredPluginDefinition,
  type ConfiguredPluginDefinition,
} from "./configured-plugin";
import type { BrainDefinition } from "./contracts/brain-definition";

export function isDeclarativeBrainDefinition(
  value: unknown,
): value is BrainDefinition {
  if (value === null || typeof value !== "object") return false;
  const candidate = value as Partial<BrainDefinition>;
  return (
    typeof candidate.name === "string" &&
    Array.isArray(candidate.plugins) &&
    candidate.plugins.every(
      (plugin: unknown): plugin is ConfiguredPluginDefinition =>
        isConfiguredPluginDefinition(plugin),
    )
  );
}
