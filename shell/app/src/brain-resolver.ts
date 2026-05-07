import type { Plugin } from "@brains/plugins";
import { composeTheme } from "@brains/theme-base";
import { ensureArray, z, ZodError, type Logger } from "@brains/utils";
import type {
  BrainDefinition,
  BrainEnvironment,
  PluginFactory,
  PresetName,
} from "./brain-definition";
import type { AppConfig, DeploymentConfigInput } from "./types";
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
  type SitePackageOverrides,
} from "./site-package";
import { resolveAIConfig } from "./ai-config";
import { defineConfig } from "./config";
import { logLevelSchema } from "./types";
import { getPackage, hasPackage } from "./package-registry";

/**
 * Determine which plugin/interface IDs are active.
 *
 * Priority:
 * 1. If presets are defined: use preset (from overrides or defaultPreset),
 *    then apply add/remove
 * 2. If no presets: all IDs are active
 */
function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): Set<string> | null {
  const allIds = new Set([
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ]);

  if (!definition.presets) return null;

  const presetName: PresetName =
    overrides?.preset ?? definition.defaultPreset ?? "default";
  const preset = definition.presets[presetName];

  if (!preset) {
    throw new Error(
      `Unknown preset "${presetName}". Available: ${Object.keys(definition.presets).join(", ")}`,
    );
  }

  const activeIds = new Set(preset);

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
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        overrideVal,
      );
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
  pluginOverrides: PluginOverrides,
  logger?: Logger,
): Plugin[] {
  const capabilities: Plugin[] = [];

  for (const [id, factory, config] of definition.capabilities) {
    if (!isActive(activeIds, id)) continue;

    const baseConfig =
      typeof config === "function" ? config(env) : (config ?? {});
    const override = pluginOverrides[id];
    const merged = override ? deepMerge(baseConfig, override) : baseConfig;
    try {
      const result = factory(merged);
      capabilities.push(...ensureArray(result));
    } catch (error) {
      if (error instanceof ZodError) {
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
      if (error instanceof ZodError) {
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
): AppConfig["identity"] | undefined {
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
): Partial<Pick<AppConfig, "database" | "logFile" | "logLevel">> {
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
  appConfig: AppConfig,
  definition: BrainDefinition,
): void {
  if (definition.extra) {
    Object.assign(appConfig, definition.extra);
  }
}

function applySiteEntityDisplay(
  appConfig: AppConfig,
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
  const appConfig: AppConfig = {
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
    ...buildPermissions(definition.permissions, overrides),
    deployment,
    ...buildRuntimeOverrides(env, overrides),
  };

  // Merge any extra config (escape hatch)
  applyExtraConfig(appConfig, definition);
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
): { permissions: Record<string, unknown> } | Record<string, never> {
  const yamlPerms = overrides?.permissions;
  const hasYamlPerms =
    yamlPerms?.anchors ?? yamlPerms?.trusted ?? yamlPerms?.rules;
  const hasTopLevel = overrides?.anchors ?? overrides?.trusted;
  const hasDefPerms = !!definitionPerms;

  if (!hasYamlPerms && !hasTopLevel && !hasDefPerms) return {};

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
    },
  };
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
  if (typeof pkg === "function") {
    return pkg as PluginFactory;
  }

  if (pkg && typeof pkg === "object") {
    const namedPlugin = (pkg as { plugin?: unknown }).plugin;
    if (typeof namedPlugin === "function") {
      return namedPlugin as PluginFactory;
    }
  }

  return undefined;
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
const routeDefinitionOverrideSchema = z
  .object({
    id: z.string().min(1),
  })
  .passthrough();

const entityDisplayEntryOverrideSchema = z
  .object({
    label: z.string().min(1),
  })
  .passthrough();

const sitePackageOverridesSchema = z
  .object({
    layouts: z.record(z.unknown()).optional(),
    plugin: z.function().optional(),
    pluginConfig: z.record(z.unknown()).optional(),
    routes: z.array(routeDefinitionOverrideSchema).optional(),
    entityDisplay: z.record(entityDisplayEntryOverrideSchema).optional(),
    staticAssets: z.record(z.string()).optional(),
  })
  .passthrough();

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

  const parsedOverrides = sitePackageOverridesSchema.safeParse(pkg);
  if (!parsedOverrides.success) return undefined;

  const conventionalOverrides =
    parsedOverrides.data as unknown as ConventionalSiteOverrides;
  const { pluginConfig, ...siteOverrides } = conventionalOverrides;
  const siteWithStructure = extendSite(
    definition.site,
    siteOverrides as SitePackageOverrides,
  );

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
