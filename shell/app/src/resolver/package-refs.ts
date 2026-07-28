import { z } from "@brains/utils/zod";
import type { PluginFactory } from "../brain-definition";
import type { ExternalPluginDeclaration } from "../instance-overrides";
import { getPackage, hasPackage } from "../package-registry";

const pluginFactorySchema = z.custom<PluginFactory>(
  (value) => typeof value === "function",
);
const externalPluginPackageSchema = z.looseObject({
  plugin: pluginFactorySchema.optional(),
});

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

export function resolveExternalPluginFactory(
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
