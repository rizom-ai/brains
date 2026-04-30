import { isScopedPackageRef } from "./brain-resolver";
import type { InstanceOverrides } from "./instance-overrides";

/**
 * Collect all @-prefixed package references from instance overrides.
 *
 * Scans `site.package`, `site.theme`, `site.themeOverride`, and plugin
 * config values. Used by both the entrypoint generator (static imports)
 * and the dev runner (dynamic imports) to ensure all referenced packages
 * are registered before resolve() runs.
 */
export function collectOverridePackageRefs(
  overrides: InstanceOverrides,
): string[] {
  const refs: string[] = [];

  // Site package + theme from brain.yaml's `site: { ... }` block
  const sitePkg = overrides.site?.package;
  if (sitePkg && isScopedPackageRef(sitePkg)) {
    refs.push(sitePkg);
  }

  const siteTheme = overrides.site?.theme;
  if (siteTheme && isScopedPackageRef(siteTheme)) {
    refs.push(siteTheme);
  }

  const siteThemeOverride = overrides.site?.themeOverride;
  if (siteThemeOverride && isScopedPackageRef(siteThemeOverride)) {
    refs.push(siteThemeOverride);
  }

  // Plugin config values
  if (overrides.plugins) {
    for (const config of Object.values(overrides.plugins)) {
      for (const value of Object.values(config)) {
        if (typeof value === "string" && isScopedPackageRef(value)) {
          refs.push(value);
        }
      }
    }
  }

  return [...new Set(refs)];
}
