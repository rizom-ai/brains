import {
  bindPluginPackageMetadata,
  isPluginPackageDefinition,
  type InstalledPluginPackageMetadata,
} from "@brains/plugins";
import { isConfiguredPluginDefinition } from "./configured-plugin";

/**
 * Package registry for pre-bundled package references.
 *
 * In production builds, the generated entrypoint registers packages here
 * so resolvePackageRefs can find them without dynamic import.
 * In dev mode, this stays empty and dynamic import is used instead.
 */
const registry = new Map<string, unknown>();
const metadataRegistry = new Map<string, InstalledPluginPackageMetadata>();
const brainMetadataRegistry = new WeakMap<
  object,
  InstalledPluginPackageMetadata
>();

export interface PackageRegistrationOptions {
  readonly version: string;
}

function isDeclarativeBrainDefinition(value: unknown): value is object {
  if (value === null || typeof value !== "object" || !("plugins" in value)) {
    return false;
  }
  const plugins = value.plugins;
  return Array.isArray(plugins) && plugins.every(isConfiguredPluginDefinition);
}

export function registerPackage(
  name: string,
  value: unknown,
  options?: PackageRegistrationOptions,
): void {
  if (!options && isPluginPackageDefinition(value)) {
    throw new Error(
      `Plugin package "${name}" must be registered with its installed version`,
    );
  }

  registry.set(name, value);

  if (!options) {
    metadataRegistry.delete(name);
    return;
  }

  const metadata = Object.freeze({ name, version: options.version });
  metadataRegistry.set(name, metadata);
  if (isPluginPackageDefinition(value)) {
    bindPluginPackageMetadata(value, metadata);
  }
  if (isDeclarativeBrainDefinition(value)) {
    brainMetadataRegistry.set(value, metadata);
  }
}

export function getPackage(name: string): unknown | undefined {
  return registry.get(name);
}

export function getPackageMetadata(
  name: string,
): InstalledPluginPackageMetadata | undefined {
  return metadataRegistry.get(name);
}

export function getBrainPackageMetadata(
  definition: object,
): InstalledPluginPackageMetadata | undefined {
  return brainMetadataRegistry.get(definition);
}

export function hasPackage(name: string): boolean {
  return registry.has(name);
}
