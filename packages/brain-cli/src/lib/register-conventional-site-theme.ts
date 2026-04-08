import {
  applyConventionalSiteRefs,
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
  registerPackage,
  type InstanceOverrides,
} from "@brains/app";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

export {
  CONVENTIONAL_SITE_PACKAGE_REF,
  CONVENTIONAL_THEME_PACKAGE_REF,
} from "@brains/app";

/**
 * Register convention-based local site/theme files for standalone repos.
 *
 * - `src/site.ts` becomes the effective `site.package` when brain.yaml omits it
 * - `src/theme.css` becomes the effective `site.theme` when brain.yaml omits it
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
        `Conventional site file ${sitePath} must default-export a SitePackage`,
      );
    }

    registerPackage(CONVENTIONAL_SITE_PACKAGE_REF, siteModule.default);
    nextOverrides = applyConventionalSiteRefs(nextOverrides, {
      sitePackageRef: CONVENTIONAL_SITE_PACKAGE_REF,
    });
  }

  const themePath = join(cwd, "src/theme.css");
  if (!overrides.site?.theme && existsSync(themePath)) {
    registerPackage(
      CONVENTIONAL_THEME_PACKAGE_REF,
      readFileSync(themePath, "utf-8"),
    );
    nextOverrides = applyConventionalSiteRefs(nextOverrides, {
      themeRef: CONVENTIONAL_THEME_PACKAGE_REF,
    });
  }

  return nextOverrides;
}
