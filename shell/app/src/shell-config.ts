import type { Shell } from "@brains/core";
import { CLI_OPERATOR_PRINCIPAL } from "./cli-operator";
import { type AppConfig, type AppConfigInput, appConfigSchema } from "./types";
import { isProductionRuntime, preferLocalUrlsForRuntime } from "./runtime-env";
import {
  resolveGitBrokerCheckout,
  resolveGitBrokerSocket,
  resolveStandardConfig,
} from "./standard-paths";

export type ShellConfig = NonNullable<Parameters<typeof Shell.createFresh>[0]>;
export type InitializeOptions = Parameters<Shell["initialize"]>[0];

/**
 * Sentinel API key injected when `--startup-check` runs without a real key
 * configured. Lets the AI client construct without paging the operator for
 * credentials; the smoke path exits before any real request is issued.
 */
export const STARTUP_CHECK_API_KEY = "startup-check";

/**
 * The plain AppConfig an App runs with, from what a caller passed in.
 *
 * Validates the schema, then attaches the parts the schema does not carry —
 * the Plugin objects and the caller-supplied blocks. Exported so tests of
 * config policy can build a real AppConfig without constructing an App.
 */
export function toAppConfig(config?: AppConfigInput): AppConfig {
  const validatedConfig = appConfigSchema.parse(config ?? {});

  // Follow Shell's pattern: validate schema then add full Plugin objects
  const appConfig: AppConfig = {
    ...validatedConfig,
    plugins: config?.plugins ?? [],
  };

  // Only add optional properties if they're defined
  if (config?.permissions) appConfig.permissions = config.permissions;
  if (config?.spaces) appConfig.spaces = config.spaces;
  if (config?.cliConfig) appConfig.cliConfig = config.cliConfig;
  if (config?.shellConfig) appConfig.shellConfig = config.shellConfig;
  return appConfig;
}

/**
 * The ShellConfig an App hands to Shell.createFresh.
 *
 * A pure function of the AppConfig and the initialize options — no App
 * instance, no Shell. Tests of config policy assert on the returned object
 * instead of spying Shell.createFresh to capture what App passed it.
 */
export function buildShellConfig(
  config: AppConfig,
  options?: InitializeOptions,
): ShellConfig {
  const shellConfig: ShellConfig = {
    plugins: config.plugins ?? [],
    ...config.shellConfig, // Allow overriding for tests/advanced use
  };

  applyStandardStorageConfig(shellConfig);
  applySimpleConfigOverrides(config, shellConfig);
  applyAIConfig(config, shellConfig, options);
  applyLoggingConfig(config, shellConfig);
  applyPermissionConfig(config, shellConfig);
  applySpacesConfig(config, shellConfig);
  applyIdentityConfig(config, shellConfig);
  applyAgentInstructions(config, shellConfig);
  applyAppMetadata(config, shellConfig);

  return shellConfig;
}

/**
 * Environment policy lives here, not in core: resolve XDG-based storage
 * paths and pass them as explicit config. Anything the caller already
 * set (tests, advanced use) wins.
 */
function applyStandardStorageConfig(shellConfig: ShellConfig): void {
  const standard = resolveStandardConfig();
  shellConfig.database ??= standard.database;
  shellConfig.jobQueueDatabase ??= standard.jobQueueDatabase;
  shellConfig.conversationDatabase ??= standard.conversationDatabase;
  shellConfig.runtimeStateDatabase ??= standard.runtimeStateDatabase;
  shellConfig.embeddingDatabase ??= standard.embeddingDatabase;
  shellConfig.embedding ??= standard.embedding;
  shellConfig.gitBrokerSocket ??= resolveGitBrokerSocket();
  shellConfig.gitBrokerCheckout ??= resolveGitBrokerCheckout();
}

function applySimpleConfigOverrides(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  // Apply simple app config (these override shellConfig if both are provided)
  if (config.database) {
    shellConfig.database = { url: config.database };
  }
  if (config.profileKind) {
    shellConfig.profileKind = config.profileKind;
  }

  // Set feature flags (none currently)
  shellConfig.features = {};
}

function applyAIConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
  options?: InitializeOptions,
): void {
  const isStartupCheck = options?.mode === "startup-check";
  if (
    !config.aiApiKey &&
    !config.aiImageKey &&
    !config.aiEmbeddingKey &&
    !config.aiModel &&
    !config.aiImageModel &&
    !config.aiEmbeddingModel &&
    !config.aiReasoningEffort &&
    !isStartupCheck
  ) {
    return;
  }

  shellConfig.ai = {
    ...shellConfig.ai,
    ...(isStartupCheck &&
      !shellConfig.ai?.apiKey && { apiKey: STARTUP_CHECK_API_KEY }),
    ...(config.aiApiKey && { apiKey: config.aiApiKey }),
    ...(config.aiImageKey && {
      imageApiKey: config.aiImageKey,
    }),
    ...(config.aiEmbeddingKey && {
      embeddingApiKey: config.aiEmbeddingKey,
    }),
    ...(config.aiModel && { model: config.aiModel }),
    ...(config.aiImageModel && { imageModel: config.aiImageModel }),
    ...(config.aiEmbeddingModel && {
      embeddingModel: config.aiEmbeddingModel,
    }),
    ...(config.aiReasoningEffort && {
      reasoningEffort: config.aiReasoningEffort,
    }),
  };
}

function applyLoggingConfig(config: AppConfig, shellConfig: ShellConfig): void {
  if (!config.logLevel && !config.logFile) return;

  shellConfig.logging = {
    level: config.logLevel ?? "info",
    format: "text",
    context: config.name,
    ...(config.logFile && { file: config.logFile }),
  };
}

function applyPermissionConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  // The command line is the brain's own interface, granted here rather than
  // in each brain's config so that authority admitted from the CLI is
  // re-resolvable when a queued job reaches its write. A rule, not an admin
  // seed: seeds are written to auth.db once and replaced by its state on
  // every later start, so a seed would never reach an existing brain.
  const rules = config.permissions?.rules ?? [];
  shellConfig.permissions = {
    ...config.permissions,
    rules: rules.some((rule) => rule.pattern === CLI_OPERATOR_PRINCIPAL)
      ? rules
      : [{ pattern: CLI_OPERATOR_PRINCIPAL, level: "admin" }, ...rules],
  };
}

function applySpacesConfig(config: AppConfig, shellConfig: ShellConfig): void {
  if (config.spaces) {
    shellConfig.spaces = config.spaces;
  }
}

function applyIdentityConfig(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  if (config.identity) {
    shellConfig.identity = config.identity;
  }
}

function applyAgentInstructions(
  config: AppConfig,
  shellConfig: ShellConfig,
): void {
  if (config.agentInstructions) {
    shellConfig.agentInstructions = config.agentInstructions;
  }
}

function applyAppMetadata(config: AppConfig, shellConfig: ShellConfig): void {
  shellConfig.name = config.name;
  shellConfig.version = config.version;

  // Set site base URL from deployment domain for entity link generation
  if (config.deployment.domain) {
    shellConfig.siteBaseUrl = config.deployment.domain;
  }

  shellConfig.localSiteUrl = `http://localhost:${config.deployment.ports.production}`;
  shellConfig.preferLocalUrls = preferLocalUrlsForRuntime();
  shellConfig.production = isProductionRuntime();
}
