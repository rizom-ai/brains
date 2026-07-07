import { PluginConfigValidationError, type Plugin } from "@brains/plugins";
import {
  entityActionPolicyConfigSchema,
  type EntityActionPolicyConfig,
  type EntityActionRequiredLevel,
} from "@brains/templates";
import { composeTheme } from "@brains/theme-base";
import { ensureArray } from "@brains/utils/array";
import { type Logger } from "@brains/utils/logger";
import { z } from "@brains/utils/zod";
import type {
  BrainDefinition,
  BrainEnvironment,
  PluginFactory,
  PresetName,
} from "./brain-definition";
import type { AppConfig, AppConfigInput, DeploymentConfigInput } from "./types";
import {
  CONVENTIONAL_SITE_PACKAGE_REF,
  getExternalPluginDeclarations,
  getPluginConfigOverrides,
  stripSiteConfig,
  type ExternalPluginDeclaration,
  type InstanceOverrides,
} from "./instance-overrides";
import {
  extendSite,
  sitePackageSchema,
  themeCssSchema,
  type ConventionalSiteOverrides,
  type SitePackage,
} from "./site-package";
import { resolveAIConfig } from "./ai-config";
import { defineConfig } from "./config";
import { logLevelSchema } from "./types";
import { getPackage, hasPackage } from "./package-registry";

const PLATFORM_ENTITY_ACTION_DEFAULTS: EntityActionPolicyConfig = {
  "*": {
    create: "anchor",
    update: "anchor",
    delete: "anchor",
    extract: "anchor",
    publish: "anchor",
  },
  "anchor-profile": {
    create: "never",
    update: "anchor",
    delete: "never",
  },
  "brain-character": {
    create: "never",
    update: "anchor",
    delete: "never",
  },
};

const recordSchema = z.record(z.string(), z.unknown());
const pluginFactorySchema = z.custom<PluginFactory>(
  (value) => typeof value === "function",
);
const externalPluginPackageSchema = z.looseObject({
  plugin: pluginFactorySchema.optional(),
});

/**
 * Determine which plugin/interface IDs are active.
 *
 * Priority:
 * 1. If presets are defined: use preset (from overrides or defaultPreset),
 *    then apply add/remove
 * 2. If no presets: all IDs are active
 */
function resolveActivePresetName(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): PresetName | undefined {
  if (!definition.presets) return undefined;

  const presetName: PresetName =
    overrides?.preset ?? definition.defaultPreset ?? "default";
  const preset = definition.presets[presetName];

  if (!preset) {
    throw new Error(
      `Unknown preset "${presetName}". Available: ${Object.keys(definition.presets).join(", ")}`,
    );
  }

  return presetName;
}

function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): Set<string> | null {
  const allIds = new Set([
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ]);

  const presetName = resolveActivePresetName(definition, overrides);
  if (!definition.presets || !presetName) return null;

  const activeIds = new Set(definition.presets[presetName]);

  // Eval mode: remove plugins with external side effects
  if (overrides?.mode === "eval" && definition.evalDisable) {
    for (const id of definition.evalDisable) {
      activeIds.delete(id);
    }
  }

  // Add: union with preset (only IDs that exist in brain definition)
  if (overrides?.add) {
    for (const id of overrides.add) {
      if (allIds.has(id)) {
        activeIds.add(id);
      }
    }
  }

  // Remove: difference from preset
  if (overrides?.remove) {
    for (const id of overrides.remove) {
      activeIds.delete(id);
    }
  }

  return activeIds;
}

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

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return recordSchema.safeParse(value).success;
}

function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const overrideVal = override[key];
    if (overrideVal === null) {
      delete result[key];
    } else if (isPlainObject(result[key]) && isPlainObject(overrideVal)) {
      result[key] = deepMerge(result[key], overrideVal);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

type ActiveIds = Set<string> | null;
type PluginOverrides = Record<string, Record<string, unknown>>;

function isActive(activeIds: ActiveIds, id: string): boolean {
  return !activeIds || activeIds.has(id);
}

function hasActiveInterface(
  definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds
    ? activeIds.has(id)
    : definition.interfaces.some(([interfaceId]) => interfaceId === id);
}

function hasActiveCapability(
  definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds
    ? activeIds.has(id)
    : definition.capabilities.some(([capabilityId]) => capabilityId === id);
}

function applyPluginDefaults(
  pluginOverrides: PluginOverrides,
  options: {
    webserverEnabled: boolean;
    siteBuilderEnabled: boolean;
    site: SitePackage | undefined;
    theme: string | undefined;
  },
): void {
  const { webserverEnabled, siteBuilderEnabled, site, theme } = options;

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
      }),
      ...(site?.staticAssets && { staticAssets: site.staticAssets }),
    };

    pluginOverrides["site-builder"] = deepMerge(
      siteBuilderDefaults,
      siteBuilderExplicit,
    );
  }

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

function instantiateSitePlugin(
  site: SitePackage | undefined,
  overrides: Omit<InstanceOverrides, "brain"> | undefined,
  activeIds: ActiveIds,
): Plugin[] {
  if (!site) return [];

  const sitePlugin = site.plugin({
    entityDisplay: site.entityDisplay,
    ...stripSiteConfig(overrides?.site),
  });

  return isActive(activeIds, "site-builder") ? [sitePlugin] : [];
}

function instantiateCapabilities(
  definition: BrainDefinition,
  env: BrainEnvironment,
  activeIds: ActiveIds,
  activePreset: PresetName | undefined,
  pluginOverrides: PluginOverrides,
  logger?: Logger,
): Plugin[] {
  const capabilities: Plugin[] = [];

  for (const [id, factory, config] of definition.capabilities) {
    if (!isActive(activeIds, id)) continue;

    const baseConfig =
      typeof config === "function"
        ? config(env, { ...(activePreset ? { preset: activePreset } : {}) })
        : (config ?? {});
    const override = pluginOverrides[id];
    const merged = override ? deepMerge(baseConfig, override) : baseConfig;
    try {
      const result = factory(merged);
      capabilities.push(...ensureArray(result));
    } catch (error) {
      if (error instanceof PluginConfigValidationError) {
        logger?.warn(`Skipping capability "${id}": missing required config`);
      } else {
        throw error;
      }
    }
  }

  return capabilities;
}

function instantiateExternalPlugins(
  declarations: Record<string, ExternalPluginDeclaration>,
  overrides?: Omit<InstanceOverrides, "brain">,
): Plugin[] {
  const plugins: Plugin[] = [];

  for (const [id, declaration] of Object.entries(declarations)) {
    if (overrides?.remove?.includes(id)) continue;

    const factory = resolveExternalPluginFactory(id, declaration);
    const result = factory(declaration.config ?? {});
    plugins.push(...ensureArray(result));
  }

  return plugins;
}

function instantiateInterfaces(
  definition: BrainDefinition,
  env: BrainEnvironment,
  activeIds: ActiveIds,
  pluginOverrides: PluginOverrides,
  logger?: Logger,
): Plugin[] {
  const interfaces: Plugin[] = [];

  for (const [id, ctor, envMapper] of definition.interfaces) {
    if (!isActive(activeIds, id)) continue;

    const baseConfig = envMapper(env);
    if (!baseConfig) continue;

    const override = pluginOverrides[id];
    const merged = override ? deepMerge(baseConfig, override) : baseConfig;
    try {
      interfaces.push(new ctor(merged));
    } catch (error) {
      if (error instanceof PluginConfigValidationError) {
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

export function resolve(
  definition: BrainDefinition,
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
  logger?: Logger,
): AppConfig {
  const activePreset = resolveActivePresetName(definition, overrides);
  const activeIds = resolveActiveIds(definition, overrides);
  const pluginOverrides = resolveAllPackageRefs(
    getPluginConfigOverrides(overrides?.plugins),
  );
  const externalPluginDeclarations = getExternalPluginDeclarations(
    overrides?.plugins,
  );
  const effectiveModel = overrides?.model ?? definition.model;
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
  const theme = resolveTheme(definition, overrides);

  applyPluginDefaults(pluginOverrides, {
    webserverEnabled,
    siteBuilderEnabled,
    site,
    theme,
  });

  // Instantiate capabilities — each plugin gets only its own
  // matching override (by plugin ID), never other plugins' overrides.
  const capabilities: Plugin[] = [
    ...instantiateSitePlugin(site, overrides, activeIds),
    ...instantiateCapabilities(
      definition,
      env,
      activeIds,
      activePreset,
      pluginOverrides,
      logger,
    ),
    ...instantiateExternalPlugins(externalPluginDeclarations, overrides),
  ];

  const interfaces = instantiateInterfaces(
    definition,
    env,
    activeIds,
    pluginOverrides,
    logger,
  );

  const identity = buildIdentity(definition);
  const deployment = buildDeployment(definition, overrides);

  // Build the app config
  const appConfig: AppConfigInput = {
    name: overrides?.name ?? definition.name,
    version: definition.version,
    plugins: [...capabilities, ...interfaces],

    // AI config from environment + brain/instance model
    ...resolveAIConfig(
      env,
      effectiveModel ? { model: effectiveModel } : undefined,
    ),

    // Optional fields
    ...(identity && { identity }),
    ...(definition.agentInstructions && {
      agentInstructions: definition.agentInstructions,
    }),
    ...buildPermissions(definition.permissions, overrides, capabilities),
    ...(overrides?.spaces ? { spaces: overrides.spaces } : {}),
    deployment,
    ...buildRuntimeOverrides(env, overrides),
  };

  // Merge any extra config (escape hatch)
  applyExtraConfig(appConfig, definition);
  applySharedTheme(appConfig, theme);
  applySiteEntityDisplay(appConfig, site);

  return defineConfig(appConfig);
}

/**
 * Build the permissions config by merging definition defaults with yaml overrides.
 *
 * Priority: yaml `permissions` section > yaml top-level `anchors`/`trusted` > definition defaults
 */
function buildPermissions(
  definitionPerms: BrainDefinition["permissions"],
  overrides?: Omit<InstanceOverrides, "brain">,
  plugins: Plugin[] = [],
): { permissions: Record<string, unknown> } | Record<string, never> {
  const yamlPerms = overrides?.permissions;
  const pluginEntityActions = mergePluginEntityActions(plugins);

  const entityActions = mergeEntityActions(
    PLATFORM_ENTITY_ACTION_DEFAULTS,
    pluginEntityActions,
    definitionPerms?.entityActions,
    yamlPerms?.entityActions,
  );
  validatePublishPolicy(entityActions);

  return {
    permissions: {
      ...(definitionPerms ?? {}),
      // Top-level anchors/trusted (legacy path)
      ...(overrides?.anchors && { anchors: overrides.anchors }),
      ...(overrides?.trusted && { trusted: overrides.trusted }),
      // yaml permissions section takes priority
      ...(yamlPerms?.anchors && { anchors: yamlPerms.anchors }),
      ...(yamlPerms?.trusted && { trusted: yamlPerms.trusted }),
      ...(yamlPerms?.rules && { rules: yamlPerms.rules }),
      ...(entityActions && { entityActions }),
    },
  };
}

function mergePluginEntityActions(
  plugins: Plugin[],
): EntityActionPolicyConfig | undefined {
  const validated: EntityActionPolicyConfig[] = [];
  for (const plugin of plugins) {
    if (!plugin.entityActionPolicy) continue;
    const parsed = entityActionPolicyConfigSchema.safeParse(
      plugin.entityActionPolicy,
    );
    if (!parsed.success) {
      throw new Error(
        `Plugin "${plugin.id}" declared an invalid entityActionPolicy: ${parsed.error.message}`,
      );
    }
    validated.push(parsed.data);
  }
  return mergeEntityActions(...validated);
}

function mergeEntityActions(
  ...sources: Array<EntityActionPolicyConfig | undefined>
): EntityActionPolicyConfig | undefined {
  if (!sources.some(Boolean)) return undefined;

  const merged: EntityActionPolicyConfig = {};
  for (const source of sources) {
    if (!source) continue;
    for (const [entityType, actions] of Object.entries(source)) {
      merged[entityType] = {
        ...(merged[entityType] ?? {}),
        ...actions,
      };
    }
  }

  return merged;
}

const ENTITY_ACTION_RESTRICTIVENESS: Record<EntityActionRequiredLevel, number> =
  {
    public: 0,
    trusted: 1,
    anchor: 2,
    never: 3,
  };

function validatePublishPolicy(
  policy: EntityActionPolicyConfig | undefined,
): void {
  if (!policy) return;

  for (const entityType of Object.keys(policy)) {
    const resolved = {
      ...(policy["*"] ?? {}),
      ...(policy[entityType] ?? {}),
    };
    if (!resolved.update || !resolved.publish) continue;

    if (
      ENTITY_ACTION_RESTRICTIVENESS[resolved.publish] <
      ENTITY_ACTION_RESTRICTIVENESS[resolved.update]
    ) {
      throw new Error(
        `Invalid entity action policy for "${entityType}": publish must be at least as restrictive as update`,
      );
    }
  }
}

/** Matches scoped npm package names like @brains/theme-default (no colons, no dots) */
const SCOPED_PACKAGE_PATTERN = /^@[\w-]+\/[\w-]+$/;

/**
 * Check if a string looks like a scoped npm package reference.
 * Excludes Matrix userIds (@user:server), email addresses, CSS selectors, etc.
 */
export function isScopedPackageRef(value: string): boolean {
  return SCOPED_PACKAGE_PATTERN.test(value);
}

/**
 * Resolve scoped package references in a config object.
 * Looks up values in the package registry (populated before resolve() is called).
 */
function isRegisteredScopedPackageRef(value: unknown): value is string {
  return (
    typeof value === "string" && isScopedPackageRef(value) && hasPackage(value)
  );
}

function resolvePackageRefValue(value: unknown): unknown {
  return isRegisteredScopedPackageRef(value) ? getPackage(value) : value;
}

function resolvePackageRefs(
  config: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      resolvePackageRefValue(value),
    ]),
  );
}

/**
 * Resolve package references across all plugin override configs.
 */
function resolveAllPackageRefs(
  pluginOverrides: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(pluginOverrides).map(([pluginId, config]) => [
      pluginId,
      resolvePackageRefs(config),
    ]),
  );
}

function getRegisteredExternalPluginPackage(
  pluginId: string,
  packageName: string,
): unknown {
  if (!hasPackage(packageName)) {
    throw new Error(
      `External plugin package "${packageName}" for plugins.${pluginId} is not registered. Install it and ensure it is imported before resolve().`,
    );
  }

  return getPackage(packageName);
}

// External plugin packages may export the factory as either the default export
// or a named `plugin` export — the public authoring contract documented in
// docs/external-plugin-authoring.md accepts both.
function pluginFactoryFromPackage(pkg: unknown): PluginFactory | undefined {
  const directFactory = pluginFactorySchema.safeParse(pkg);
  if (directFactory.success) return directFactory.data;

  const packageShape = externalPluginPackageSchema.safeParse(pkg);
  return packageShape.success ? packageShape.data.plugin : undefined;
}

function resolveExternalPluginFactory(
  pluginId: string,
  declaration: ExternalPluginDeclaration,
): PluginFactory {
  const packageName = declaration.package;
  const pkg = getRegisteredExternalPluginPackage(pluginId, packageName);
  const factory = pluginFactoryFromPackage(pkg);

  if (factory) {
    return factory;
  }

  throw new Error(
    `External plugin package "${packageName}" for plugins.${pluginId} must export a plugin factory as the package default or as a named "plugin" export.`,
  );
}

/**
 * Resolve the site package from brain.yaml override or brain definition default.
 * brain.yaml `site.package` (a @-prefixed package ref) takes priority.
 */
const routeDefinitionOverrideSchema = z.looseObject({
  id: z.string().min(1),
});

const entityDisplayEntryOverrideSchema = z.looseObject({
  label: z.string().min(1),
});

const sitePackagePluginOverrideSchema = z.custom<(...args: never[]) => unknown>(
  (value) => typeof value === "function",
);

const sitePackageOverridesShapeSchema = z.looseObject({
  layouts: z.record(z.string(), z.unknown()).optional(),
  plugin: sitePackagePluginOverrideSchema.optional(),
  pluginConfig: z.record(z.string(), z.unknown()).optional(),
  routes: z.array(routeDefinitionOverrideSchema).optional(),
  entityDisplay: z
    .record(z.string(), entityDisplayEntryOverrideSchema)
    .optional(),
  staticAssets: z.record(z.string(), z.string()).optional(),
});

// Validate the shape loosely (plugin as a bare function, layouts/routes as
// records) but declare the trusted output type once here at the parse
// boundary — same idiom as sitePackageSchema in site-package.ts.
const conventionalSiteOverridesSchema = z.custom<ConventionalSiteOverrides>(
  (value) => sitePackageOverridesShapeSchema.safeParse(value).success,
);

function applySitePluginConfig(
  site: SitePackage,
  pluginConfig: Record<string, unknown> | undefined,
): SitePackage {
  if (!pluginConfig) return site;

  return {
    ...site,
    plugin: (config?: Record<string, unknown>) =>
      site.plugin({
        ...pluginConfig,
        ...(config ?? {}),
      }),
  };
}

function resolveConventionalSitePackage(
  pkg: unknown,
  definition: BrainDefinition,
): SitePackage | undefined {
  if (!definition.site) return undefined;

  const parsedOverrides = conventionalSiteOverridesSchema.safeParse(pkg);
  if (!parsedOverrides.success) return undefined;

  const { pluginConfig, ...siteOverrides } = parsedOverrides.data;
  const siteWithStructure = extendSite(definition.site, siteOverrides);

  return applySitePluginConfig(siteWithStructure, pluginConfig);
}

function resolveRegisteredSitePackage(
  pkgRef: string,
  pkg: unknown,
  definition: BrainDefinition,
): SitePackage | undefined {
  const parsedSitePackage = sitePackageSchema.safeParse(pkg);
  if (parsedSitePackage.success) {
    return parsedSitePackage.data;
  }

  if (pkgRef === CONVENTIONAL_SITE_PACKAGE_REF) {
    return resolveConventionalSitePackage(pkg, definition);
  }

  return undefined;
}

function resolveSitePackage(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): SitePackage | undefined {
  const pkgRef = overrides?.site?.package;
  if (!pkgRef || !hasPackage(pkgRef)) {
    return definition.site;
  }

  const sitePackage = resolveRegisteredSitePackage(
    pkgRef,
    getPackage(pkgRef),
    definition,
  );
  if (sitePackage) {
    return sitePackage;
  }

  throw new Error(`Package "${pkgRef}" is not a valid SitePackage`);
}

function resolveThemeCssRef(refOrCss: string): string {
  if (hasPackage(refOrCss)) {
    const pkg = getPackage(refOrCss);
    const parsed = themeCssSchema.safeParse(pkg);
    if (!parsed.success) {
      throw new Error(`Package "${refOrCss}" does not export theme CSS`);
    }
    return parsed.data;
  }

  return refOrCss;
}

function resolveTheme(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): string | undefined {
  const baseTheme = overrides?.site?.theme
    ? resolveThemeCssRef(overrides.site.theme)
    : definition.theme;
  const themeOverride = overrides?.site?.themeOverride
    ? resolveThemeCssRef(overrides.site.themeOverride)
    : undefined;

  if (!baseTheme && !themeOverride) {
    return undefined;
  }

  return composeTheme([baseTheme, themeOverride].filter(Boolean).join("\n\n"));
}
