/** Public root library export for brain definitions and plugin API compatibility. */

export { defineBrain } from "@brains/app/contracts/brain-definition";
export type {
  BrainAnchorConfigKind,
  BrainDefinition,
  BrainIdentity,
  BrainEnvironment,
  BrainMode,
  PresetName,
  CapabilityConfig,
  CapabilityContext,
  CapabilityEntry,
  DeploymentConfigInput,
  InterfaceEntry,
  InterfaceConstructor,
  PermissionConfig,
  Plugin,
  PluginFactory,
  PluginConfig,
  ReasoningEffort,
  SitePackage,
} from "@brains/app/contracts/brain-definition";
export { PLUGIN_API_VERSION } from "../plugin-api-version";
export { z, ZodError } from "@brains/utils/zod";
export type { ZodSchema, ZodType } from "@brains/utils/zod";
