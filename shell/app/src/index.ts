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
export { resolve } from "./brain-resolver";
export { parseInstanceOverrides } from "./instance-overrides";
export type { InstanceOverrides } from "./instance-overrides";
export type {
  BrainDefinition,
  BrainIdentity,
  BrainContentModel,
  BrainEnvironment,
  CapabilityEntry,
  InterfaceEntry,
  EntityRouteEntry,
} from "./brain-definition";
