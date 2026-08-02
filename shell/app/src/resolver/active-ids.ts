import type { BrainDefinition } from "../brain-definition";
import type { CapabilityBundleDefinition } from "../bundle-definition";
import {
  resolveBundleSelection,
  type BundleSelectionResolution,
} from "../bundle-resolution";
import type { InstanceOverrides } from "../instance-overrides";

export type ActiveIds = Set<string>;
export type PluginOverrides = Record<string, Record<string, unknown>>;

export interface ResolvedBrainSelection {
  activeIds: ActiveIds;
  activeBundles: readonly string[];
  bundleDefinitions: readonly CapabilityBundleDefinition[];
  resolution: BundleSelectionResolution;
}

export function resolveBrainSelection(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ResolvedBrainSelection {
  const catalogIds = [
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ];
  const sharedInput = {
    catalogIds,
    mode: overrides?.mode,
    evalDisable: definition.evalDisable,
    add: overrides?.add,
    remove: overrides?.remove,
  } as const;

  const bundleDefinitions = definition.bundles ?? [];
  if (overrides?.bundles !== undefined) {
    const resolution = resolveBundleSelection({
      ...sharedInput,
      definitions: bundleDefinitions,
      selected: overrides.bundles,
    });
    return {
      activeIds: new Set(resolution.activeMembers),
      activeBundles: resolution.activeBundles,
      bundleDefinitions,
      resolution,
    };
  }

  if (bundleDefinitions.length > 0) {
    throw new Error(
      'brain.yaml must select explicit "bundles"; run `brain config migrate` for legacy configs',
    );
  }

  const completeCatalogBundle: CapabilityBundleDefinition = {
    id: "__complete-catalog__",
    members: [...new Set(catalogIds)],
  };
  const resolution = resolveBundleSelection({
    ...sharedInput,
    definitions: [completeCatalogBundle],
    selected: [completeCatalogBundle.id],
  });

  return {
    activeIds: new Set(resolution.activeMembers),
    activeBundles: [],
    bundleDefinitions: [],
    resolution,
  };
}

export function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): ActiveIds {
  return resolveBrainSelection(definition, overrides).activeIds;
}

export function isActive(activeIds: ActiveIds, id: string): boolean {
  return activeIds.has(id);
}

export function hasActiveInterface(
  _definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds.has(id);
}

export function hasActiveCapability(
  _definition: BrainDefinition,
  activeIds: ActiveIds,
  id: string,
): boolean {
  return activeIds.has(id);
}
