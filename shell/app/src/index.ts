export { App } from "./app";
export { defineConfig } from "./config";
export { handleCLI } from "./cli";
export { SeedDataManager } from "./seed-data-manager";
export { MigrationManager } from "./migration-manager";
export type {
  AppConfig,
  DeploymentConfig,
  DeploymentConfigInput,
} from "./types";
export { deploymentConfigSchema, logLevelSchema } from "./types";
export type { LogLevel } from "./types";

// Brain definition / resolver API
export { defineBrain } from "./brain-definition";
export { resolve, isScopedPackageRef } from "./brain-resolver";
export { registerPackage } from "./package-registry";
export {
  parseInstanceOverrides,
  InstanceOverridesParseError,
} from "./instance-overrides";
export type { InstanceOverrides } from "./instance-overrides";
export type {
  BrainDefinition,
  BrainIdentity,
  BrainContentModel,
  BrainEnvironment,
  PluginConfig,
  CapabilityEntry,
  CapabilityConfig,
  PluginFactory,
  InterfaceEntry,
  InterfaceConstructor,
} from "./brain-definition";
export type { SitePackage } from "./site-package";
