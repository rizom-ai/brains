/** Public root authoring surface for brain definitions and typed composition. */

export { defineBrain, defineBundle } from "./brain-definition";
export { use } from "./configured-plugin";
export type {
  BrainAnchorConfigKind,
  BrainDefinition,
  BrainIdentity,
  BrainMode,
  BundleConfigContribution,
  BundlePermissionContribution,
  CapabilityBundleDefinition,
  ConfiguredPluginDefinition,
  DeploymentConfigInput,
  PermissionConfig,
  PluginPackageDefinition,
  ReasoningEffort,
} from "./brain-definition";
