import { isScopedPackageRef } from "./brain-resolver";
import type { InstanceOverrides } from "./instance-overrides";

/**
 * Collect all @-prefixed package references from instance overrides.
 *
 * Scans top-level keys (site) and plugin config values.
 * Used by both the entrypoint generator (static imports) and
 * the dev runner (dynamic imports) to ensure all referenced
 * packages are registered before resolve() runs.
 */
export function collectOverridePackageRefs(
  overrides: InstanceOverrides,
): string[] {
  const refs: string[] = [];

  // Top-level site package
  if (overrides.site && isScopedPackageRef(overrides.site)) {
    refs.push(overrides.site);
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

  return refs;
}
