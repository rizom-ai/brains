import type { PluginFactory } from "../brain-definition";
import type { ExternalPluginDeclaration } from "../instance-overrides";
import { getPackage, hasPackage } from "../package-registry";

/** Matches scoped npm package names like @rizom/theme-default (no colons, no dots) */
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
export function resolveAllPackageRefs(
  pluginOverrides: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(pluginOverrides).map(([pluginId, config]) => [
      pluginId,
      resolvePackageRefs(config),
    ]),
  );
}

export function resolveExternalPluginFactory(
  pluginId: string,
  declaration: ExternalPluginDeclaration,
): PluginFactory {
  throw new Error(
    `External plugin declaration "plugins.${pluginId}.package" for "${declaration.package}" uses the removed alpha factory contract. Default-export a declarative package definition from a @rizom/brain define helper and compose it with use() in defineBrain().`,
  );
}
