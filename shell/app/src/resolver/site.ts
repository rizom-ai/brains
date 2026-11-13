import {
  createDeclaredDataSource,
  isFetchingDataSourceDeclaration,
  registerSiteRuntime,
  withSiteRuntimeDefaults,
  type IShell,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { withThemeBase } from "@brains/theme-base";
import { z } from "@brains/utils/zod";
import type { BrainDefinition } from "../brain-definition";
import {
  CONVENTIONAL_SITE_PACKAGE_REF,
  stripSiteConfig,
  type InstanceOverrides,
} from "../instance-overrides";
import {
  extendSite,
  sectionGroupToTemplates,
  sitePackageSchema,
  themeCssSchema,
  type ConventionalSiteOverrides,
  type SitePackage,
  type SiteSectionGroup,
} from "../site-package";
import { siteRuntimeOf } from "@brains/site-composition";
import { getPackage, hasPackage } from "../package-registry";
import { isActive, type ActiveIds } from "./active-ids";

function normalizeSiteSections(
  sections: SitePackage["sections"],
): SiteSectionGroup[] {
  if (!sections) return [];
  return Array.isArray(sections) ? sections : [sections];
}

class DeclarativeSitePlugin implements Plugin {
  readonly id = "site-package";
  readonly version = "0.1.0";
  readonly type = "service" as const;
  readonly description = "Declarative site package adapter";

  readonly packageName: string;
  private readonly site: SitePackage;
  private readonly runtimeConfig: Record<string, unknown>;

  constructor(
    packageName: string,
    site: SitePackage,
    runtimeConfig: Record<string, unknown> = {},
  ) {
    this.packageName = packageName;
    this.site = site;
    this.runtimeConfig = runtimeConfig;
  }

  async register(shell: IShell): Promise<PluginCapabilities> {
    // What a first-party site carries, configured as its plugin was.
    registerSiteRuntime(
      shell,
      this.packageName,
      siteRuntimeOf(this.site),
      this.runtimeConfig,
    );

    // A site's sources are named by the site package, as a package's own
    // sources are, and read by other packages under the same name.
    const dataSourceId = (localId: string): string =>
      `${this.packageName}:${localId}`;
    const registry = shell.getDataSourceRegistry();
    for (const declaration of this.site.dataSources ?? []) {
      if (!isFetchingDataSourceDeclaration(declaration)) {
        throw new Error(
          `Site data source "${String(Reflect.get(declaration, "id"))}" is not a fetching source declared with defineDataSource`,
        );
      }
      const id = dataSourceId(declaration.id);
      registry.register(
        createDeclaredDataSource(declaration, id, shell.getLogger(), {
          publicId: id,
          runtimeState: shell.getRuntimeState(),
          dataSources: registry,
        }),
      );
    }

    for (const group of normalizeSiteSections(this.site.sections)) {
      shell.registerTemplates(
        sectionGroupToTemplates(group, { dataSourceId }),
        group.namespace,
      );
    }

    return { tools: [], resources: [] };
  }
}

export function instantiateSitePlugins(
  site: SitePackage | undefined,
  overrides: Omit<InstanceOverrides, "brain"> | undefined,
  activeIds: ActiveIds,
  allowImplicitSite = false,
): Plugin[] {
  if (!site || (!allowImplicitSite && !isActive(activeIds, "site-builder"))) {
    return [];
  }

  const plugins: Plugin[] = [];

  if (site.sections || site.dataSources || siteRuntimeOf(site) !== undefined) {
    plugins.push(
      new DeclarativeSitePlugin(
        overrides?.site?.package ?? "@rizom/site-package",
        site,
        {
          entityDisplay: site.entityDisplay,
          ...stripSiteConfig(overrides?.site),
        },
      ),
    );
  }

  return plugins;
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

const sitePackageOverridesShapeSchema = z.looseObject({
  layouts: z.record(z.string(), z.unknown()).optional(),
  pluginConfig: z.record(z.string(), z.unknown()).optional(),
  routes: z.array(routeDefinitionOverrideSchema).optional(),
  entityDisplay: z
    .record(z.string(), entityDisplayEntryOverrideSchema)
    .optional(),
  content: z.unknown().optional(),
  themeOverride: z.string().optional(),
  headScripts: z.array(z.string()).optional(),
  staticAssets: z.record(z.string(), z.string()).optional(),
});

// Validate the shape loosely (layouts/routes as records) but declare the trusted output type once here at the parse
// boundary — same idiom as sitePackageSchema in site-package.ts.
const conventionalSiteOverridesSchema = z.custom<ConventionalSiteOverrides>(
  (value) => sitePackageOverridesShapeSchema.safeParse(value).success,
);

function applySitePluginConfig(
  site: SitePackage,
  pluginConfig: Record<string, unknown> | undefined,
): SitePackage {
  return pluginConfig ? withSiteRuntimeDefaults(site, pluginConfig) : site;
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
  if (pkgRef === CONVENTIONAL_SITE_PACKAGE_REF) {
    const conventionalSite = resolveConventionalSitePackage(pkg, definition);
    if (conventionalSite) return conventionalSite;
  }

  const parsedSitePackage = sitePackageSchema.safeParse(pkg);
  return parsedSitePackage.success ? parsedSitePackage.data : undefined;
}

export function resolveSitePackage(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): SitePackage | undefined {
  const pkgRef = overrides?.site?.package;
  if (!pkgRef) {
    return definition.site;
  }

  if (!hasPackage(pkgRef)) {
    throw new Error(
      `brain.yaml site.package "${pkgRef}" could not be resolved — the package is not installed or failed to import. Refusing to fall back to the default site.`,
    );
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

export function resolveTheme(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
  site?: SitePackage,
): string | undefined {
  const baseTheme = overrides?.site?.theme
    ? resolveThemeCssRef(overrides.site.theme)
    : definition.theme;
  const siteThemeOverride = site?.themeOverride;
  const instanceThemeOverride = overrides?.site?.themeOverride
    ? resolveThemeCssRef(overrides.site.themeOverride)
    : undefined;
  const theme = [baseTheme, siteThemeOverride, instanceThemeOverride]
    .filter(Boolean)
    .join("\n\n");

  if (!theme) {
    return undefined;
  }

  return withThemeBase(theme);
}
