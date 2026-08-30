export { App } from "./app";
export { defineConfig } from "./config";
export { handleCLI } from "./cli";
export { SeedDataManager } from "./seed-data-manager";
export { MigrationManager } from "./migration-manager";
export {
  resolveStandardConfig,
  resolveStandardConfigWithDirectories,
  resolveStandardPaths,
} from "./standard-paths";
export type {
  AppConfig,
  AppConfigInput,
  DeploymentConfig,
  DeploymentConfigInput,
  ReasoningEffort,
} from "./types";
export {
  deploymentConfigSchema,
  logLevelSchema,
  reasoningEffortSchema,
} from "./types";
export type { LogLevel } from "./types";

// Brain definition / resolver API
export {
  isConfiguredPluginDefinition,
  use,
  type ConfiguredPluginDefinition,
} from "./configured-plugin";
export { brainAnchorConfigKindSchema, defineBrain } from "./brain-definition";
export { defineBundle } from "./bundle-definition";
export {
  resolveBundleSelection,
  type BundleSelectionInput,
  type BundleSelectionResolution,
  type ResolvedBundlePermissionContribution,
} from "./bundle-resolution";
export {
  isDeclarativeBrainDefinition,
  normalizeDeclarativeBrainDefinition,
} from "./declarative-brain";
export { resolve, isScopedPackageRef } from "./brain-resolver";
export { resolveBrainPackageName } from "./brain-package";
export {
  registerPackage,
  getPackage,
  getPackageMetadata,
  hasPackage,
  type PackageRegistrationOptions,
} from "./package-registry";
export { collectOverridePackageRefs } from "./override-package-refs";
export { generateEntrypoint } from "./generate-entrypoint";
export type { GenerateEntrypointOptions } from "./generate-entrypoint";
export { registerOverridePackages } from "./register-override-packages";
export type { PackageImportFn } from "./register-override-packages";
export {
  registerBrainDefinitionPackages,
  type InstalledPackageImport,
} from "./register-brain-definition-packages";
export {
  parseInstanceOverrides,
  InstanceOverridesParseError,
  applyConventionalSiteRefs,
  pluginOverrideEntrySchema,
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "./instance-overrides";
export {
  registerConventionalSitePackage,
  registerConventionalSiteTheme,
} from "./register-conventional-site-theme";
export type { InstanceOverrides } from "./instance-overrides";
export type {
  BrainAnchorConfigKind,
  BrainDefinition,
  BrainIdentity,
  BrainEnvironment,
  BrainMode,
  PluginConfig,
  CapabilityEntry,
  CapabilityConfig,
  CapabilityContext,
  PluginFactory,
  InterfaceEntry,
} from "./brain-definition";
export type {
  BundleConfigContribution,
  BundlePermissionContribution,
  CapabilityBundleDefinition,
} from "./bundle-definition";
export type {
  ConventionalSiteOverrides,
  SitePackage,
  SitePackageOverrides,
} from "./site-package";
export { extendSite } from "./site-package";
