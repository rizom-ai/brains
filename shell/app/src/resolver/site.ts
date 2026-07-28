import {
  SITE_BUILDER_CHANNELS,
  SYSTEM_CHANNELS,
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
  createSiteContentTemplates,
  extendSite,
  sectionGroupToTemplates,
  sitePackageSchema,
  themeCssSchema,
  type ConventionalSiteOverrides,
  type SiteContentDefinition,
  type SitePackage,
  type SiteSectionGroup,
} from "../site-package";
import { getPackage, hasPackage } from "../package-registry";
import { isActive, type ActiveIds } from "./active-ids";

export function normalizeSiteContent(
  content: SitePackage["content"],
): SiteContentDefinition[] {
  if (!content) return [];
  return Array.isArray(content) ? content : [content];
}

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

  constructor(packageName: string, site: SitePackage) {
    this.packageName = packageName;
    this.site = site;
  }

  async register(shell: IShell): Promise<PluginCapabilities> {
    for (const definition of normalizeSiteContent(this.site.content)) {
      shell.registerTemplates(
        createSiteContentTemplates(definition),
        definition.namespace,
      );
    }

    for (const group of normalizeSiteSections(this.site.sections)) {
      shell.registerTemplates(sectionGroupToTemplates(group), group.namespace);
    }

    if (this.site.headScripts?.length) {
      const messaging = shell.getMessageBus();
      messaging.subscribe(SYSTEM_CHANNELS.pluginsRegistered, async () => {
        for (const [index, script] of this.site.headScripts?.entries() ?? []) {
          await messaging.send({
            type: SITE_BUILDER_CHANNELS.headScriptRegister,
            sender: this.id,
            payload: {
              pluginId: `${this.id}:${index}`,
              script,
            },
          });
        }
        return { success: true };
      });
    }

    return { tools: [], resources: [] };
  }
}

export function instantiateSitePlugins(
  site: SitePackage | undefined,
  overrides: Omit<InstanceOverrides, "brain"> | undefined,
  activeIds: ActiveIds,
): Plugin[] {
  if (!site || !isActive(activeIds, "site-builder")) return [];

  const plugins: Plugin[] = [];
  if (site.plugin) {
    plugins.push(
      site.plugin({
        entityDisplay: site.entityDisplay,
        ...stripSiteConfig(overrides?.site),
      }),
    );
  }

  if (site.content || site.headScripts?.length) {
    plugins.push(
      new DeclarativeSitePlugin(
        overrides?.site?.package ?? "@rizom/site-package",
        site,
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
  content: z.unknown().optional(),
  themeOverride: z.string().optional(),
  headScripts: z.array(z.string()).optional(),
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
  if (!pluginConfig || !site.plugin) return site;

  const plugin = site.plugin;
  return {
    ...site,
    plugin: (config?: Record<string, unknown>) =>
      plugin({
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
