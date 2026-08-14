/** Public root authoring surface for brain definitions and typed composition. */

export {
  defineBrain,
  defineBundle,
} from "@brains/app/contracts/brain-definition";
export { use } from "@brains/app";
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
} from "@brains/app/contracts/brain-definition";
