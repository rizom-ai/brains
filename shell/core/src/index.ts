export { Shell } from "./shell";
export type { ShellDependencies } from "./shell";
export type { BootMode } from "./initialization/shellBootloader";
export type {
  RuntimeProcessRole,
  ShellRuntimeOptions,
} from "./runtime-process-role";
export type { PeerChannel, PeerEvent } from "./peer-event-relay";
export { PROJECTION_RULE_JOB_TYPE } from "./projection-wave-scheduler";
export type { ProjectionRuntimeControls } from "./projection-runtime";
export type { ProjectionRuleDiagnostic } from "./projection-rule-job-handler";

export {
  KEY_PROVIDER_IDS,
  keyEnvVar,
  providerKeysSchema,
  readProviderKeys,
} from "@brains/ai-service";
export type { KeyProviderId, ProviderKeys } from "@brains/ai-service";
export {
  createShellConfig,
  createStandardConfig,
  getStandardConfig,
  httpHostConfigSchema,
  httpSettingsSchema,
  logLevelSchema,
  reasoningEffortSchema,
  shellConfigSchema,
  STANDARD_PATHS,
} from "./config";
export type {
  HttpHostConfig,
  HttpHostConfigInput,
  HttpSettings,
  ShellConfig,
  StandardConfig,
  StandardPaths,
} from "./config";
// The AI configuration a shell gives its AI service, for a host that supplies its own.
export { createAIModelConfig } from "./initialization/service-config";
export { shellEnvVars } from "./env-schema";

export type { IEmbeddingService } from "@brains/entity-service";

export {
  SHELL_DATASOURCE_IDS,
  SHELL_ENTITY_TYPES,
  SHELL_TEMPLATE_NAMES,
} from "./constants";
