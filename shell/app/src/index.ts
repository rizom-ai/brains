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
export { registerPackage, getPackage, hasPackage } from "./package-registry";
export { collectOverridePackageRefs } from "./override-package-refs";
export {
  parseInstanceOverrides,
  InstanceOverridesParseError,
  applyConventionalSiteRefs,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "./instance-overrides";
export type { InstanceOverrides } from "./instance-overrides";
export type {
  BrainDefinition,
  BrainIdentity,
  BrainEnvironment,
  PluginConfig,
  CapabilityEntry,
  CapabilityConfig,
  PluginFactory,
  InterfaceEntry,
  InterfaceConstructor,
} from "./brain-definition";
export type { SitePackage } from "./site-package";
