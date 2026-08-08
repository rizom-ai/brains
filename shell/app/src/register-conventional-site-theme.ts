import {
  applyConventionalSiteRefs,
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  type InstanceOverrides,
} from "./instance-overrides";
import { getPackage, registerPackage } from "./package-registry";
import {
  extendSite,
  sitePackageSchema,
  type ConventionalSiteOverrides,
  type SitePackage,
} from "./site-package";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

export {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "./instance-overrides";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function applyPluginConfig(
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

/**
 * Register a local `src/site.tsx` package, optionally composing its overrides
 * over the explicit `brain.yaml` site package first.
 */
export function registerConventionalSitePackage(
  localSite: unknown,
  basePackageRef?: string,
): void {
  if (!basePackageRef) {
    registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, localSite);
    return;
  }

  const basePackage = sitePackageSchema.safeParse(getPackage(basePackageRef));
  if (!basePackage.success) {
    throw new Error(
      `brain.yaml site.package "${basePackageRef}" could not be resolved as the base for src/site.tsx`,
    );
  }
  if (!isRecord(localSite)) {
    throw new Error(
      "Conventional site file src/site.tsx must default-export site overrides",
    );
  }

  const { pluginConfig: rawPluginConfig, ...rawOverrides } = localSite;
  if (rawPluginConfig !== undefined && !isRecord(rawPluginConfig)) {
    throw new Error("src/site.tsx pluginConfig must be a mapping");
  }

  const composed = extendSite(
    basePackage.data,
    rawOverrides as ConventionalSiteOverrides,
  );
  registerPackage(
    CONVENTIONAL_SITE_PACKAGE_REF,
    applyPluginConfig(composed, rawPluginConfig),
  );
}

/**
 * Register convention-based local authoring files.
 *
 * - `src/site.tsx` becomes the effective `site.package`; when brain.yaml names
 *   a package, the local file layers over that explicit base package
 * - `src/theme.css` becomes an additive `site.themeOverride` layer so apps can
 *   extend a shared base theme without forking it
 * - `src/site-content.ts` becomes the effective `plugins.site-content.definitions`
 *   source when brain.yaml does not explicitly define it
 */
export async function registerConventionalSiteTheme(
  cwd: string,
  overrides: InstanceOverrides,
): Promise<InstanceOverrides> {
  let nextOverrides = overrides;

  const sitePath = join(cwd, "src/site.tsx");
  if (existsSync(sitePath)) {
    const siteModule = await import(pathToFileURL(sitePath).href);
    if (siteModule.default === undefined) {
      throw new Error(
        `Conventional site file ${sitePath} must default-export a SitePackage or site overrides`,
      );
    }

    registerConventionalSitePackage(
      siteModule.default,
      overrides.site?.package,
    );
    nextOverrides = applyConventionalSiteRefs(nextOverrides, {
      sitePackageRef: CONVENTIONAL_SITE_PACKAGE_REF,
    });
  }

  const themePath = join(cwd, "src/theme.css");
  if (!overrides.site?.themeOverride && existsSync(themePath)) {
    registerPackage(
      CONVENTIONAL_THEME_PACKAGE_REF,
      readFileSync(themePath, "utf-8"),
    );
    nextOverrides = applyConventionalSiteRefs(nextOverrides, {
      themeOverrideRef: CONVENTIONAL_THEME_PACKAGE_REF,
    });
  }

  const siteContentPath = join(cwd, "src/site-content.ts");
  const siteContentPluginConfig = nextOverrides.plugins?.["site-content"];
  if (
    siteContentPluginConfig?.["definitions"] === undefined &&
    existsSync(siteContentPath)
  ) {
    const siteContentModule = await import(pathToFileURL(siteContentPath).href);
    if (siteContentModule.default === undefined) {
      throw new Error(
        `Conventional site-content file ${siteContentPath} must default-export site content definitions`,
      );
    }

    registerPackage(
      CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
      siteContentModule.default,
    );
    nextOverrides = applyConventionalSiteRefs(nextOverrides, {
      siteContentDefinitionsRef: CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
    });
  }

  return nextOverrides;
}
