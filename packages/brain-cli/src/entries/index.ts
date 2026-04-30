/** Public root library export for brain definitions and plugin API compatibility. */

export { defineBrain } from "@brains/app/contracts/brain-definition";
export type {
  BrainDefinition,
  BrainIdentity,
  BrainEnvironment,
  BrainMode,
  PresetName,
  CapabilityConfig,
  CapabilityEntry,
  InterfaceEntry,
  InterfaceConstructor,
  PluginFactory,
  PluginConfig,
} from "@brains/app/contracts/brain-definition";
export { PLUGIN_API_VERSION } from "../plugin-api-version";
