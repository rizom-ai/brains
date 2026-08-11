import { isPluginConfigValidationError, type Plugin } from "@brains/plugins";
import { ensureArray } from "@brains/utils/array";
import { type Logger } from "@brains/utils/logger";
import type { BrainDefinition, BrainEnvironment } from "./brain-definition";
import type { BrainDefinition as DeclarativeBrainDefinition } from "./contracts/brain-definition";
import {
  isDeclarativeBrainDefinition,
  normalizeDeclarativeBrainDefinition,
} from "./declarative-brain";
import type { AppConfig, AppConfigInput, DeploymentConfigInput } from "./types";
import {
  getPluginConfigOverrides,
  type InstanceOverrides,
} from "./instance-overrides";
import type { SitePackage } from "./site-package";
import { resolveAIConfig } from "./ai-config";
import { defineConfig } from "./config";
import { logLevelSchema } from "./types";
import {
  hasActiveCapability,
  hasActiveInterface,
  isActive,
  resolveBrainSelection,
  type PluginOverrides,
  type ResolvedBrainSelection,
} from "./resolver/active-ids";
import { deepMerge } from "./resolver/merge";
import {
  isScopedPackageRef,
  resolveAllPackageRefs,
} from "./resolver/package-refs";
import { resolveBundlePermissionConfig } from "./bundle-permissions";
import { buildPermissions } from "./resolver/permissions";
import {
  instantiateSitePlugins,
  resolveSitePackage,
  resolveTheme,
} from "./resolver/site";

export { isScopedPackageRef };

/**
 * Resolve a brain definition + environment into a runnable AppConfig.
 *
 * Each call creates fresh plugin and interface instances from the
 * definition's factories. This means the same definition can be
 * resolved multiple times with different environments to produce
 * independent brain instances.
 *
 * @param definition - The brain model (what the brain IS)
 * @param env - The deployment environment (secrets)
 * @param overrides - Instance overrides from brain.yaml (optional)
 * @returns A fully resolved AppConfig ready for handleCLI() or App.create()
 */

function applyPluginDefaults(
  pluginOverrides: PluginOverrides,
  options: {
    webserverEnabled: boolean;
    siteBuilderEnabled: boolean;
    site: SitePackage | undefined;
    theme: string | undefined;
    anchor: NonNullable<BrainDefinition["anchor"]>;
  },
): void {
  const { webserverEnabled, siteBuilderEnabled, site, theme, anchor } = options;

  if (webserverEnabled) {
    const webserverExplicit = pluginOverrides["webserver"] ?? {};
    const webserverDefaults: Record<string, unknown> = {
      enablePreview: siteBuilderEnabled,
    };

    pluginOverrides["webserver"] = deepMerge(
      webserverDefaults,
      webserverExplicit,
    );
  }

  if (site || theme !== undefined) {
    const siteBuilderExplicit = pluginOverrides["site-builder"] ?? {};
    const siteBuilderDefaults: Record<string, unknown> = {
      ...(theme !== undefined && { themeCSS: theme }),
      ...(site && {
        routes: site.routes,
        entityDisplay: site.entityDisplay,
        layouts: site.layouts,
        ...(site.headScripts && { headScripts: site.headScripts }),
      }),
      ...(site?.staticAssets && { staticAssets: site.staticAssets }),
    };

    pluginOverrides["site-builder"] = deepMerge(
      siteBuilderDefaults,
      siteBuilderExplicit,
    );
  }

  const authServiceExplicit = pluginOverrides["auth-service"] ?? {};
  pluginOverrides["auth-service"] = {
    ...authServiceExplicit,
    anchor,
  };

  if (theme !== undefined) {
    const dashboardDefaults: Record<string, unknown> = { themeCSS: theme };
    const dashboardExplicit = pluginOverrides["dashboard"] ?? {};
    pluginOverrides["dashboard"] = deepMerge(
      dashboardDefaults,
      dashboardExplicit,
    );

    const dashboardRootExplicit = pluginOverrides["dashboard-root"] ?? {};
    pluginOverrides["dashboard-root"] = deepMerge(
      dashboardDefaults,
      dashboardRootExplicit,
    );
  }
}

function instantiateCapabilities(
  definition: BrainDefinition,
  env: BrainEnvironment,
  selection: ResolvedBrainSelection,
  pluginOverrides: PluginOverrides,
  logger?: Logger,
): Plugin[] {
  const capabilities: Plugin[] = [];

  for (const [id, factory, config] of definition.capabilities) {
    if (!isActive(selection.activeIds, id)) continue;

    const baseConfig =
      typeof config === "function"
        ? config(env, { bundles: selection.activeBundles })
        : (config ?? {});
    const bundleConfig = selection.resolution.configByMember[id];
    const withBundle = bundleConfig
      ? deepMerge(baseConfig, bundleConfig)
      : baseConfig;
    const override = pluginOverrides[id];
    const merged = override ? deepMerge(withBundle, override) : withBundle;
    try {
      const result = factory(merged);
      capabilities.push(...ensureArray(result));
    } catch (error) {
      if (isPluginConfigValidationError(error)) {
        logger?.warn(`Skipping capability "${id}": missing required config`);
      } else {
        throw error;
      }
    }
  }

  return capabilities;
}

function instantiateInterfaces(
  definition: BrainDefinition,
  env: BrainEnvironment,
  selection: ResolvedBrainSelection,
  pluginOverrides: PluginOverrides,
  logger?: Logger,
): Plugin[] {
  const interfaces: Plugin[] = [];

  for (const [id, ctor, envMapper] of definition.interfaces) {
    if (!isActive(selection.activeIds, id)) continue;

    const baseConfig = envMapper(env);
    if (!baseConfig) continue;

    const bundleConfig = selection.resolution.configByMember[id];
    const withBundle = bundleConfig
      ? deepMerge(baseConfig, bundleConfig)
      : baseConfig;
    const override = pluginOverrides[id];
    const merged = override ? deepMerge(withBundle, override) : withBundle;
    try {
      interfaces.push(new ctor(merged));
    } catch (error) {
      if (isPluginConfigValidationError(error)) {
        logger?.warn(`Skipping interface "${id}": missing required config`);
      } else {
        throw error;
      }
    }
  }

  return interfaces;
}

function buildIdentity(
  definition: BrainDefinition,
): AppConfigInput["identity"] | undefined {
  return definition.identity
    ? {
        name: definition.identity.characterName,
        role: definition.identity.role,
        purpose: definition.identity.purpose,
        values: definition.identity.values,
      }
    : undefined;
}

function buildDeployment(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): DeploymentConfigInput {
  const deployment: DeploymentConfigInput = {
    ...(definition.deployment ?? {}),
  };

  if (overrides?.domain) {
    deployment.domain = overrides.domain;
  }
  if (overrides?.port) {
    deployment.ports = {
      ...(deployment.ports ?? {}),
      production: overrides.port,
    };
  }

  return deployment;
}

function buildRuntimeOverrides(
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
): Partial<Pick<AppConfigInput, "database" | "logFile" | "logLevel">> {
  return {
    // Log level: yaml overrides > env > undefined
    ...(overrides?.logLevel
      ? { logLevel: overrides.logLevel }
      : logLevelSchema.safeParse(env["LOG_LEVEL"]).success
        ? { logLevel: logLevelSchema.parse(env["LOG_LEVEL"]) }
        : {}),

    // Log file: yaml overrides > env > undefined
    ...(overrides?.logFile
      ? { logFile: overrides.logFile }
      : env["LOG_FILE"]
        ? { logFile: env["LOG_FILE"] }
        : {}),

    // Database: yaml overrides > env > undefined
    ...(overrides?.database
      ? { database: overrides.database }
      : env["DATABASE_URL"]
        ? { database: env["DATABASE_URL"] }
        : {}),
  };
}

function applyExtraConfig(
  appConfig: AppConfigInput,
  definition: BrainDefinition,
): void {
  if (definition.extra) {
    Object.assign(appConfig, definition.extra);
  }
}

function applyEmbeddingConfig(
  appConfig: AppConfigInput,
  embedding: InstanceOverrides["embedding"],
): void {
  if (embedding?.enabled === undefined) return;

  appConfig.shellConfig = {
    ...appConfig.shellConfig,
    embedding: {
      ...appConfig.shellConfig?.embedding,
      enabled: embedding.enabled,
    },
  };
}

function applySharedTheme(
  appConfig: AppConfigInput,
  themeCSS: string | undefined,
): void {
  if (themeCSS === undefined) return;

  appConfig.shellConfig = {
    ...appConfig.shellConfig,
    themeCSS,
  };
}

function applySiteEntityDisplay(
  appConfig: AppConfigInput,
  site: SitePackage | undefined,
): void {
  if (!site) return;

  const existingShellConfig = appConfig.shellConfig ?? {};
  const existingEntityDisplay = existingShellConfig.entityDisplay ?? {};
  appConfig.shellConfig = {
    ...existingShellConfig,
    entityDisplay: {
      ...site.entityDisplay,
      ...existingEntityDisplay,
    },
  };
}

function resolveRuntimeDefinition(
  definition: BrainDefinition,
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
  logger?: Logger,
): AppConfig {
  const selection = resolveBrainSelection(definition, overrides);
  const activeIds = selection.activeIds;
  const bundlePermissions = resolveBundlePermissionConfig(
    selection.bundleDefinitions,
    selection.resolution.permissionContributions,
  );
  const pluginOverrides = resolveAllPackageRefs(
    getPluginConfigOverrides(overrides?.plugins),
  );
  const effectiveModel = overrides?.model ?? definition.model;
  const effectiveReasoningEffort =
    overrides?.reasoningEffort ?? definition.reasoningEffort;
  const effectiveAnchor = overrides?.anchor ?? definition.anchor ?? "person";
  const effectiveProfileKind = overrides?.kind ?? definition.kind;
  const webserverEnabled = hasActiveInterface(
    definition,
    activeIds,
    "webserver",
  );
  const siteBuilderEnabled = hasActiveCapability(
    definition,
    activeIds,
    "site-builder",
  );

  const site: SitePackage | undefined = resolveSitePackage(
    definition,
    overrides,
  );
  const theme = resolveTheme(definition, overrides, site);

  applyPluginDefaults(pluginOverrides, {
    webserverEnabled,
    siteBuilderEnabled,
    site,
    theme,
    anchor: effectiveAnchor,
  });

  // Instantiate capabilities — each plugin gets only its own
  // matching override (by plugin ID), never other plugins' overrides.
  const capabilities: Plugin[] = [
    ...instantiateSitePlugins(
      site,
      overrides,
      activeIds,
      selection.bundleDefinitions.length === 0,
    ),
    ...instantiateCapabilities(
      definition,
      env,
      selection,
      pluginOverrides,
      logger,
    ),
  ];

  const interfaces = instantiateInterfaces(
    definition,
    env,
    selection,
    pluginOverrides,
    logger,
  );

  const identity = buildIdentity(definition);
  const deployment = buildDeployment(definition, overrides);
  const agentInstructions = [
    ...(definition.agentInstructions ?? []),
    ...selection.resolution.agentInstructions,
  ];

  // Build the app config
  const appConfig: AppConfigInput = {
    name: overrides?.name ?? definition.name,
    version: definition.version,
    plugins: [...capabilities, ...interfaces],

    // AI config from environment + brain/instance model
    ...resolveAIConfig(env, {
      ...(effectiveModel && { model: effectiveModel }),
      ...(effectiveReasoningEffort && {
        reasoningEffort: effectiveReasoningEffort,
      }),
    }),

    // Optional fields
    ...(identity && { identity }),
    ...(effectiveProfileKind && { profileKind: effectiveProfileKind }),
    ...(agentInstructions.length > 0 ? { agentInstructions } : {}),
    ...buildPermissions(
      definition.permissions,
      bundlePermissions,
      overrides,
      capabilities,
    ),
    ...(overrides?.spaces ? { spaces: overrides.spaces } : {}),
    deployment,
    ...buildRuntimeOverrides(env, overrides),
  };

  // Merge any extra config (escape hatch)
  applyExtraConfig(appConfig, definition);
  applyEmbeddingConfig(appConfig, overrides?.embedding);
  applySharedTheme(appConfig, theme);
  applySiteEntityDisplay(appConfig, site);

  return defineConfig(appConfig);
}

export function resolve(
  definition: BrainDefinition | DeclarativeBrainDefinition,
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
  logger?: Logger,
): AppConfig {
  const runtimeDefinition = isDeclarativeBrainDefinition(definition)
    ? normalizeDeclarativeBrainDefinition(definition)
    : definition;
  return resolveRuntimeDefinition(runtimeDefinition, env, overrides, logger);
}
