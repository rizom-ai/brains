import {
  applyConventionalSiteRefs,
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  type InstanceOverrides,
} from "./instance-overrides";
import { registerPackage } from "./package-registry";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

export {
  CONVENTIONAL_SITE_CONTENT_PACKAGE_REF,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "./instance-overrides";

/**
 * Register convention-based local authoring files.
 *
 * - `src/site.ts` becomes the effective `site.package` when brain.yaml omits it
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

  const sitePath = join(cwd, "src/site.ts");
  if (!overrides.site?.package && existsSync(sitePath)) {
    const siteModule = await import(pathToFileURL(sitePath).href);
    if (siteModule.default === undefined) {
      throw new Error(
        `Conventional site file ${sitePath} must default-export a SitePackage or site overrides`,
      );
    }

    registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, siteModule.default);
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
