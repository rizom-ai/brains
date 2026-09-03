export { Shell } from "./shell";
export type { ShellDependencies } from "./shell";
export type { BootMode } from "./initialization/shellBootloader";
export {
  localDatabaseEndpointEnv,
  localDatabaseOwnershipEnv,
  parseLocalDatabaseEndpointConfig,
  resolveRuntimeProcessTopology,
  type LocalDatabaseEndpointConfig,
  type RuntimeProcessRole,
  type RuntimeProcessTopology,
  type ShellRuntimeOptions,
} from "./runtime-process-role";
export { PROJECTION_RULE_JOB_TYPE } from "./projection-wave-scheduler";
export {
  LOCAL_DATABASE_CLI_SERVICE,
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "./local-database-endpoint";
export type { ProjectionRuntimeControls } from "./projection-runtime";
export type { ProjectionRuleDiagnostic } from "./projection-rule-job-handler";

export {
  createShellConfig,
  createStandardConfig,
  getStandardConfig,
  shellConfigSchema,
  STANDARD_PATHS,
} from "./config";
export type { ShellConfig, StandardConfig, StandardPaths } from "./config";
export { shellEnvVars } from "./env-schema";

export type { IEmbeddingService } from "@brains/entity-service";

export {
  SHELL_DATASOURCE_IDS,
  SHELL_ENTITY_TYPES,
  SHELL_TEMPLATE_NAMES,
} from "./constants";
